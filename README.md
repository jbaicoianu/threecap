# threecap

## What is this?
Threecap is a library which allows you to capture the output of a Three.js app or a 2d canvas.  Threecap runs entirely in the browser, and is capable of outputing full-motion h264 MP4, GIF, Ogg Theora, VP7, VP8, VP9, WebM, and even FLV files.

## How does this work?
Threecap makes use of [FFmpeg](https://www.ffmpeg.org/) for video encoding.  FFmpeg has been cross-compiled to work with JavaScript using [Emscripten](https://github.com/kripken/emscripten), thanks to the work of the [videoconverter.js](https://bgrins.github.io/videoconverter.js/) project.  All of the hard work happens in a worker thread, which allows the encoder to run without impacting the app's framerate. 

Example usage:
```js
  var composer = new THREE.EffectsComposer();
  // set up effects passes for your app here

  var threecap = new THREEcap();
  threecap.record({
    width: 640,
    height: 480,
    fps: 25,
    time: 10,
    format: 'mp4',
    //canvas: canvasDomElement,   // optional, slowest
    composer: composer // optional, fastest
  }).then(function(video) {
    video.saveFile('myVideo.mp4');
  });
```

For a simple example of adding capture support to a Three.js app which already uses the EffectsComposer, see [this changelog](https://github.com/jbaicoianu/threecap/commit/72235765c417bca4a04cc4a1e94831c0c3f38094)

## Sample Output
![AugmentedPerception.com - GIF, 640x360, 12s](http://jbaicoianu.github.io/threecap/images/threecap-example-augmentedperception.gif "AugmentedPerception.com - GIF, 640x360, 12s")

![Sample GIF](http://jbaicoianu.github.io/threecap/images/threecap-example-asteroids.gif)


Here's a fancy diagram showing how it works:
![System Architecture](https://raw.githubusercontent.com/wiki/jbaicoianu/threecap/media/threecap_system_architecture.png)

## Why would you do this?
Initially, I started this project as a joke, my hobby is making JavaScript do things it was never intended for.  I thought surely it would be ridiculous, there's no way I could encode video in my browser at any sort of reasonable speed, right?  Turns out I was wrong.  On my laptop I can capture and encode 30fps 480p mp4 video in realtime, 720p encodes at around 10fps.

Some people might argue that you could do the same as this tool using a desktop app like [Fraps](http://www.fraps.com/) to capture videos like this.  That's true of course, but by using Threecap you can offer this functionality to all users of your project, allowing them to record gifs and videos of their gameplay to share with friends.  Using a system like [Elation Share](https://github.com/jbaicoianu/elation-share) you can upload these videos and images directly to cloud services like [Dropbox](http://www.dropbox.com), [Google Drive](http://drive.google.com/), [Youtube](http://youtube.com/), [Imgur](http://imgur.com/), etc.

## Who is responsible for this?
Threecap was created and is maintained by [James Baicoianu](https://github.com/jbaicoianu/)
