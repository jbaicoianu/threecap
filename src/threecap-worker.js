importScripts('threecap.js', 'ffmpeg.js');

var threecap = new THREEcap({inWorker: true});
onmessage = threecap.handleWorkerRequest.bind(threecap);
