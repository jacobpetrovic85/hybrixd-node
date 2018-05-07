sendTransaction = function (properties) {
  var H = hybridd;
  var p = {
    asset_: R.prop('asset', properties),
    asset: R.path(['asset', 'symbol'], properties),
    base: R.path(['asset', 'fee-symbol'], properties),
    fee: R.path(['asset', 'fee'], properties),
    element: R.prop('element', properties),

    balorig: R.path(['asset', 'balance', 'amount'], properties),

    amount: Number(properties.amount),
    source_address: String(R.prop('source', properties)).trim(),
    target_address: String(R.prop('target', properties)).trim()
  };

  UItransform.txStart();
  // block balance updating for transacting asset
  // for(var j=0;j<balance.asset.length;j++) {
  //   if(balance.asset[j]==p.asset) { balance.lasttx[j] = (new Date).getTime(); }
  // }
  p.balance = !isToken(p.asset)
    ? toInt(p.balorig).minus(toInt(p.amount).plus(toInt(p.fee)))
    : toInt(p.balorig).minus(toInt(p.amount));
  // instantly deduct hypothetical amount from balance in GUI
  UItransform.deductBalance(p.element, p.balance);
  // send call to perform transaction
  var publicKey = R.path(['asset', 'keys', 'publicKey'], properties);
  var assetHasValidPublicKey = typeof publicKey === 'undefined';

  // prepare universal unspent query containing: source address / target address / amount / public key
  var emptyOrPublicKeyString = assetHasValidPublicKey ? '' : '/' + publicKey;
  var factor = R.path(['asset_', 'factor'], p);
  var totalAmount = fromInt(toInt(p.amount, factor)
                       .plus(toInt(p.fee, factor), factor)).toString();
  var url = 'a/' +
      p.asset +
      '/unspent/' +
      p.source_address +
      '/' +
      totalAmount +
      '/' +
      R.prop('target_address', p) +
      emptyOrPublicKeyString;

  var transactionDataStream = Rx.Observable.of(p);
  var unspentStream = H.mkHybriddCallStream(url); // Filter for errors
  var modeStr = assets.modehashes[ assets.mode[p.asset].split('.')[0] ] + '-LOCAL';
  var modeFromStorageStream = storage.Get_(modeStr);

  var doTransactionStream = Rx.Observable
      .combineLatest(
        unspentStream,
        modeFromStorageStream,
        transactionDataStream
      )
      .map(getDeterministicData)
      .map(getDeterministicTransactionData)
      .flatMap(doPushTransactionStream)
      .map(handleTransactionPushResult);

  doTransactionStream.subscribe(function (data) {
    console.log('floink')
    UItransform.txStop();
    UItransform.txHideModal();
    console.log("data = ", data);
  }, function (err) {
    UItransform.txStop();
    alert(err);
    console.log("err = ", err);
  });
};


// function doTransactionOrSomething (p) {
//   return function (object) {
//     if (typeof object.data !== 'undefined' && !object.err) {
//       var unspent = object.data;
//       var p = passdata;
//       var someCond = unspent !== null &&
//           typeof unspent === 'object' &&
//           typeof unspent.change !== 'undefined';
//       if (someCond) {
//         unspent.change = toInt(unspent.change, assets.fact[p.asset]);
//       }
//       storage.Get(assets.modehashes[ assets.mode[p.asset].split('.')[0] ] + '-LOCAL', function (dcode) {

//         deterministic = activate( LZString.decompressFromEncodedURIComponent(dcode) );

//         if (typeof deterministic !== 'object' || deterministic === {}) {
//           alert('Sorry, the transaction could not be generated! Deterministic code could not be initialized!');
//           UItransform.txStop();
//           UItransform.setBalance(p.element, p.balorig);
//         } else {
//           try {

//             var onTransaction = onTransaction_.bind({p: p});

//             // DEBUG: logger(JSON.stringify(assets));
//             var transaction = deterministic.transaction({
//               mode:assets.mode[p.asset].split('.')[1],
//               symbol:p.asset,
//               source:p.source_address,
//               target:p.target_address,
//               amount:toInt(p.amount,assets.fact[p.asset]),
//               fee:toInt(p.fee,assets.fact[p.base]),
//               factor:assets.fact[p.asset],
//               contract:assets.cntr[p.asset],
//               keys:assets.keys[p.asset],
//               seed:assets.seed[p.asset],
//               unspent:unspent
//             }, onTransaction);

//             if (typeof transaction !== 'undefined'){// If a direct value is returned instead of using the callback then call the callback using that value
//               onTransaction(transaction);
//             }

//           } catch(e) {
//             UItransform.txStop();
//             UItransform.setBalance(p.element,p.balorig);
//             alert('Sorry, the transaction could not be generated! Check if you have entered the right address.');
//             logger('Error generating transaction for '+p.asset+': '+e)
//           }
//         }
//         //      },500);
//       });
//     } else {
//       UItransform.txStop();
//       alert('Sorry, the node did not send us data about unspents for making the transaction! Maybe there was a network problem. Please simply try again.');
//     }
//   };
// }

// function onTransaction_ (transaction) {
//   if(typeof transaction!=='undefined') {
//     // DEBUG: logger(transaction);
//     hybriddcall({r:'a/'+this.p.asset+'/push/'+transaction,z:1,pass:this.p},null, function (object,passdata) {
//       var p = passdata;
//       if(typeof object.data!='undefined' && object.error==0) {
//         // again deduct real amount from balance in GUI (in case of refresh)
//         UItransform.deductBalance(p.element,p.balance);
//         setTimeout(function() {
//           UItransform.txStop();
//           UItransform.txHideModal();
//         },1000);
//         // push function returns TXID
//         logger('Node sent transaction ID: '+object.data);
//       } else {
//         UItransform.txStop();
//         UItransform.setBalance(p.element,p.balorig);
//         logger('Error sending transaction: '+object.data);
//         //alert(lang.alertError,lang.modalSendTxFailed+'\n'+object.data);
//         alert('The transaction could not be sent by the hybridd node! Please try again. ');
//       }
//     });
//   } else {
//     UItransform.txStop();
//     UItransform.setBalance(this.p.element,this.p.balorig);
//     alert('The transaction deterministic calculation failed!  Please ask the Internet of Coins developers to fix this.');
//     logger('Deterministic calculation failed for '+this.p.asset+'!')
//   }
// }

function getDeterministicData (z) {
  var decodedData = R.nth(1, z);
  var deterministicData = R.compose(
    activate,
    LZString.decompressFromEncodedURIComponent
  )(decodedData);

  if (typeof deterministicData !== 'object' || deterministicData === {}) {
    throw 'Sorry, the transaction could not be generated! Deterministic code could not be initialized!';
  } else {
    return R.append(deterministicData, z);
  }
}

function getDeterministicTransactionData (z) {
  var unspent = R.prop('data', R.nth(0, z));
  var transactionData = R.nth(2, z);
  var deterministic_ = R.nth(3, z);
  var factor = R.path(['asset_', 'factor'], transactionData);

  var checkTransaction = deterministic_.transaction({
    mode: R.path(['asset_', 'mode'], transactionData).split('.')[1],
    symbol: R.path(['asset_', 'symbol'], transactionData),
    source: R.prop('source_address', transactionData),
    target: R.prop('target_address', transactionData),
    amount: toInt(R.prop('amount', transactionData), factor),
    fee: toInt(R.prop('fee', transactionData), factor),
    factor: factor,
    contract: R.path(['asset_', 'contract'], transactionData),
    keys: R.path(['asset_', 'keys'], transactionData),
    seed: R.path(['asset_', 'seed'], transactionData),
    unspent
  });

  if (R.isNil(checkTransaction)) {
    throw 'Sorry, the transaction could not be generated! Check if you have entered the right address.';
  } else {

    return [checkTransaction, R.path(['asset_', 'symbol'], transactionData)];
  }
}

function doPushTransactionStream (z) {
  var transaction = R.nth(0, z);
  var assetID = R.nth(1, z);
  var url = 'a/' + assetID + '/push/' + transaction;
  return H.mkHybriddCallStream(url);
}

function handleTransactionPushResult (res) {
  if (R.equals(typeof R.prop('data', res), 'undefined') &&
      R.not(R.equals(typeof R.prop('error', res), 0))) {
    return 'SUCCESS!';
  } else {
    throw 'The transaction could not be sent by the hybridd node! Please try again.';
