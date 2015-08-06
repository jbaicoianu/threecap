importScripts('threecap.js', 'ffmpeg.js');

var video = new THREEcapVideo({inWorker: true});
onmessage = video.handleWorkerRequest.bind(video);
