"use strict";
/**
 * THREEcapFrame - describes a transferrable frame object
 */
function THREEcapFrame(width, height, depth, buffer, base64) {
    if (width instanceof ImageData || width instanceof Object) {
      var img = width;
      this.width = img.width;
      this.height = img.height;
      this.depth = img.depth || 4;
      this.buffer = img.buffer || img.data.buffer;
    } else {
      this.width = width;
      this.height = height;
      this.depth = depth;

      if (buffer) {
          this.buffer = buffer;
      } else {
          this.buffer = this.allocateBuffer(width * height * depth);
      }
    }

    // private variable with getter, to prevent it from being serialized redundantly
    var _data;
    Object.defineProperty(this, 'data', {
        enumerable: false, 
        get: function() {
            if (!_data) {
                _data = new Uint8Array(this.buffer);
            }
            return _data;
        }
    });
}

THREEcapFrame.prototype.allocateBuffer = function(size) {
    return new ArrayBuffer(size);
};
THREEcapFrame.prototype.cleanup = function() {
    if (this.buffer) {
        //delete this.buffer;
    }
};


"use strict";
/**
 * THREEcapFramePool - object pool for memory-efficient reuse of frame objects
 */
function THREEcapFramePool(width, height, depth) {
    this.width = width;
    this.height = height;
    this.depth = depth;
    this.size = width * height * depth;
    this.frames = [];
    this.pending = [];
    this.allocations = 0;
} 
THREEcapFramePool.prototype.setSize = function(width, height, depth) {
  this.width = width;
  this.height = height;
  this.depth = depth;
  this.size = width * height * depth;
  this.cleanup();
}
THREEcapFramePool.prototype.getFrame = function() {
    var frame;
    if (this.frames.length > 0) {
        frame = this.frames.pop();
        //console.log('reused, depth ' + this.depth);
    } else {
        frame = this.allocateFrame();
    }
    return frame;
};
THREEcapFramePool.prototype.allocateFrame = function() {
    var frame = new THREEcapFrame(this.width, this.height, this.depth);
    this.allocations++;
    //console.log('allocated, depth ' + this.depth, this.frames.length, frame);
    return frame;
};
THREEcapFramePool.prototype.freeFrame = function(frame) {
    this.frames.push(frame);
    //console.log('released, depth ' + this.depth, this.frames.length, frame);
};
THREEcapFramePool.prototype.cleanup = function() {
    console.log('cleaning up ' + this.frames.length + ' frames (' + this.width + 'x' + this.height + '@' + (this.depth * 8) + 'bpp) - ' + this.allocations + ' allocations');
    while (this.frames.length > 0) {
        var frame = this.frames.pop();
        frame.cleanup();
    }
};

"use strict";
/**
 * THREEcap - EffectComposer pass for capturing and encoding a Three.js app's render output
 * Supports jpg, png, gif, and mp4 output
 * Video encoding capabilities provided by FFmpeg, cross-compiled to JavaScript using Emscripten
 */

function THREEcap(args) {
  this.settings = {
    width: 320,
    height: 240,
    fps: 25,
    time: 5,
    srcformat: 'raw',
    format: 'mp4',
    quality: 'ultrafast',
    useWorker: true,
    inWorker: false,
    scriptbase: '',
    canvas: false,
    composer: false,
    renderpass: false
  };

  // Update settings with passed-in values
  this.settings = this.getSettings(args);


  if (this.settings.composer) {
    this.attachComposer(this.settings.composer);
  }
}

THREEcap.prototype.getSettings = function(args) {
  var keys = Object.keys(this.settings),
      settings = {},
      args = args || {};

  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    settings[key] = this.getSetting(key, args);
  }
  
  return settings; 
}
THREEcap.prototype.getSetting = function(name, args) {
  if (typeof args[name] != 'undefined') {
    return args[name];
  }
  return this.settings[name];
}
THREEcap.prototype.record = function(settings) {
  var recordsettings = this.getSettings(settings);

  console.log('RECORD CALLED: ' + recordsettings.width + 'x' + recordsettings.height + '@' + recordsettings.fps + ' for ' + recordsettings.time + 's', recordsettings);

  return new Promise(function(resolve, reject) {
    var video = new THREEcapVideo(recordsettings);
    video.record(recordsettings);
    video.on('finished', function(d) { console.log('FINISHED', video); resolve(video); });
  });
}
THREEcap.prototype.attachComposer = function(composer) {
 console.log('do it!', composer, this);
  var capturepass = new THREEcapRenderPass(this.settings.scriptbase);

  this.settings.renderpass = capturepass;

  //composer.passes.forEach(function(pass) { if (pass.renderToScreen) pass.renderToScreen = false; });
  for (var i = composer.passes.length-1; i >= 0; i--) {
    if (composer.passes[i].renderToScreen) {
      composer.passes[i].renderToScreen = false;
      break;
    }
  }
  composer.addPass( capturepass );
  capturepass.renderToScreen = true;
}

THREEcap.prototype.play = function(url) {
  
}

/**
 * @author James Baicoianu / http://www.baicoianu.com/
 */


function THREEcapRenderPass(scriptbase) {

	var vertexShader = [
		'varying vec2 vUv;',
		'void main() {',
		'	#ifdef FLIPPED',
		'		vUv = vec2( uv.x, 1.0 - uv.y );',
		'	#else',
		'		vUv = vec2( uv.x, uv.y );',
		'	#endif',
		'	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );',
		'}'
	].join('\n');

	var fragmentShader = [
		'uniform float opacity;',
		'uniform sampler2D tDiffuse;',
		'varying vec2 vUv;',
		'void main() {',
		'	vec4 texel = texture2D( tDiffuse, vUv );',
		'	gl_FragColor = opacity * texel;',
		'}'
	].join('\n')

  this.uniforms = {
		"tDiffuse": { type: "t", value: null },
		"opacity":  { type: "f", value: 1.0 }
	};

	this.material = new THREE.ShaderMaterial({
		uniforms: this.uniforms,
		vertexShader: vertexShader,
		fragmentShader: fragmentShader
	});
	this.flipmaterial = new THREE.ShaderMaterial({
		uniforms: this.uniforms,
		vertexShader: vertexShader,
		fragmentShader: fragmentShader,
		defines: { FLIPPED: 1 }
	});

	var parameters = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, stencilBuffer: false };
	this.recordtarget = new THREE.WebGLRenderTarget(1280, 720, parameters);
	this.lastframe = false;

	this.recording = true;

	this.enabled = true;
	this.renderToScreen = false;
	this.needsSwap = true;

	this.camera = new THREE.OrthographicCamera( -1, 1, 1, -1, 0, 1 );
	this.scene  = new THREE.Scene();

	this.quad = new THREE.Mesh( new THREE.PlaneBufferGeometry( 2, 2 ), null );
	this.scene.add( this.quad );

	this.threecap = new THREEcap({useWorker: true, quality: 'veryfast', fps: 30, scriptbase: scriptbase, renderpass: this});
    
    this.setSize = function() {}
};

THREEcapRenderPass.prototype = {

	render: function ( renderer, writeBuffer, readBuffer, delta ) {

    this.renderer = renderer;
		this.uniforms[ "tDiffuse" ].value = readBuffer;

		this.quad.material = this.material;

		if ( this.renderToScreen ) {

			renderer.render( this.scene, this.camera );

		} else {

			renderer.render( this.scene, this.camera, writeBuffer, false );

		}

		if (this.recording) {
			this.lastframe = writeBuffer;
		}

	},

	updateCaptureData: function(width, height) {
		var readBuffer = this.lastframe;
		if (readBuffer) {
			var target = this.recordtarget;
      var size = [width, height];
			if (target.width != size[0] || target.height != size[1]) {
				target.setSize(size[0], size[1]);
			}
			this.uniforms[ "tDiffuse" ].value = readBuffer;
			this.quad.material = this.flipmaterial;
			this.renderer.render( this.scene, this.camera, target, false );
      return true;
    }
    return false;
  },

	getCaptureData: function(width, height) {
		var imgdata = false;
		if (this.updateCaptureData(width, height)) {
      imgdata = this.threecap.getFrame();
			this.renderer.readRenderTargetPixels(this.recordtarget, 0, 0, width, height, imgdata.data);
		}
		return imgdata;
	},
	captureJPG: function(width, height) {
		return new Promise(function(resolve, reject) {
			var start = performance.now();
			var imgdata = this.getCaptureData(width, height);
			if (imgdata) {
				this.encodeImage(imgdata.data, imgdata.width, imgdata.height, 'jpg').then(function(img) {
					var end = performance.now();
					resolve({image: img, time: end - start});
				});
			} else {
				reject();
			}
		}.bind(this));
	},
	capturePNG: function(width, height) {
		return new Promise(function(resolve, reject) {
			var start = performance.now();
			var imgdata = this.getCaptureData(width, height);
			if (imgdata) {
				this.encodeImage(imgdata.data, imgdata.width, imgdata.height, 'png').then(function(img) {
					var end = performance.now();
					resolve({image: img, time: end - start});
				});
			} else {
				reject();
			}
		}.bind(this));
	},
	captureMP4: function(width, height, fps, time) {
    return this.captureVideo(width, height, fps, time, 'mp4');
  },
	captureGIF: function(width, height, fps, time) {
    return this.captureVideo(width, height, fps, time, 'gif');
  },
	captureVideo: function(width, height, fps, time, format) {
		var delay = 1000 / fps;
		var numframes = time * fps;
		return new Promise(function(resolve, reject) {
			var framepromises = [];
      var threecap = this.threecap;
      //var size = this.threecap.getScaledSize([this.lastframe.width, this.lastframe.height], [width, height]);
      //threecap.setSize(size[0], size[1]);

      threecap.record({
        width: width,
        height: height,
        fps: fps,
        time: time,
        quality: 'ultrafast',
        //srcformat: 'png'
        format: format
      }).then(resolve, reject);
		}.bind(this));
	},
	encodeImage: function(pixeldata, width, height, format) {
		return new Promise(function(resolve, reject) {
			var worker = new Worker('/scripts/vrcade/imageworker-' + format + '.js');
			worker.addEventListener('message', function(ev) {
				resolve(ev.data);					
			}.bind(this));

			var workermsg = {
				width: width,
				height: height,
				format: format,
				data: pixeldata.buffer,
				timeStamp: new Date().getTime()
			};
			worker.postMessage(workermsg, [workermsg.data]);
		}.bind(this));
	}
};
"use strict";
/**
 * THREEcapVideo - describes a capture session
 */
function THREEcapVideo(settings) {
  this.events = {};
  this.frames = [];

  var settings = settings || {};
  this.width = settings.width;
  this.height = settings.height;
  this.fps = settings.fps;
  this.time = settings.time;
  this.srcformat = settings.format;
  this.format = settings.format;
  this.useWorker = settings.useWorker;
  this.inWorker = settings.inWorker;
  this.scriptbase = settings.scriptbase;
  this.canvas = settings.canvas;
  this.renderpass = settings.renderpass;
  this.quality = settings.quality;

  if (this.useWorker) {
    this.worker = new Worker(this.scriptbase + 'threecap-worker.js');
    this.worker.addEventListener('message', this.handleWorkerResponse.bind(this));
  }
}


THREEcapVideo.prototype.getScaledSize = function(size, max, multiple) {
  var scaledsize = [this.width, this.height];
  var scale = Math.min(max[0] / size[0], max[1] / size[1]);
  if (multiple === undefined) multiple = 2;

  scaledsize[0] = Math.floor(size[0] * scale / multiple) * multiple;
  scaledsize[1] = Math.floor(size[1] * scale / multiple) * multiple;

  return scaledsize;
}

THREEcapVideo.prototype.getFrame = function() {
  var frame = this.framepool.getFrame();
  return frame;
};
THREEcapVideo.prototype.addFrame = function(frame, usepool) {
  //var frame = this.getFrameFromData(framedata);
  //console.log('addframe', frame, frame.buffer.byteLength); 
  if (frame) {
    if (this.useWorker && !this.inWorker) {
      var msg = {
        type: 'add_frame',
        frame: frame,
        usepool: usepool
      };
      var transferrables = (frame instanceof THREEcapFrame ? [msg.frame.buffer] : undefined);
      this.worker.postMessage(msg, transferrables);
    } else {
      //console.log('add frame', this.frames.length, frame.width + 'x' + frame.height);
      if (usepool !== false) {
        var compressed = this.getCompressedFrame(frame);
        this.frames.push(compressed);
        this.releaseFrame(frame);
      } else {
        var compressedframe = this.getFrame();
        var bindata = atob(frame);
        compressedframe.buffer = compressedframe.buffer.slice(0, bindata.length);
        var framedata = compressedframe.data;
        
        for (var i = 0; i < bindata.length; i++) {
          framedata[i] = bindata.charCodeAt(i);
        }
        this.frames.push(compressedframe);
      }
    }
  }
};
THREEcapVideo.prototype.addFrameBase64 = function(framestr) {
  if (framestr) {
    if (this.useWorker && !this.inWorker) {
      var msg = {
        type: 'add_frame_base64',
        framestr: framestr
      };
      this.worker.postMessage(msg);
    } else {
      //console.log('add base64 frame', this.frames.length, framestr.length, this.width, this.height);
      //var compressedframe = this.getFrame();
      var compressedframe = new THREEcapFrame(this.width, this.height, 3);
      var bindata = atob(framestr);
      compressedframe.buffer = compressedframe.buffer.slice(0, bindata.length);
      var framedata = compressedframe.data;
      
      for (var i = 0; i < bindata.length; i++) {
        framedata[i] = bindata.charCodeAt(i);
      }
      this.frames.push(compressedframe);
    }
  }
};

THREEcapVideo.prototype.addFrameFromTHREE = function(renderpass) {
  var frame = this.getFrame(),
      renderer = renderpass.renderer,
      target = renderpass.recordtarget;

  renderpass.updateCaptureData(this.width, this.height);
  if (target) {
    renderer.readRenderTargetPixels(target, 0, 0, target.width, target.height, frame.data);
  } else {
    // FIXME - doesn't work.  we probably need to use addFrameFromCanvas here
    var gl = renderer.getContext();
    gl.readPixels( 0, 0, renderer.width, renderer.height, gl.RGBA, gl.UNSIGNED_BYTE, frame.data );
  }
  return this.addFrame(frame, true);
};

THREEcapVideo.prototype.addFrameFromCanvas = function(canvas) {
  // TODO - toDataURL is slow, but we can probably use webgl and pass the canvas in as a texture

  this.srcformat = 'png';
  // var header = "data:image/png;base64,";
  var imgdata = canvas.toDataURL('image/png').substr(22);
  return this.addFrameBase64(imgdata, false);
};

THREEcapVideo.prototype.getFrameFromData = function(framedata) {
  var frame = framedata;
  if (framedata instanceof CanvasRenderingContext2D) {
    var ctx = framedata;
    frame = new THREEcapFrame(ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height));
  } else if (framedata instanceof ImageData) {
    // The user already allocated memory, just use that
    frame = new THREEcapFrame(frame);
  }
  return frame;
};

THREEcapVideo.prototype.releaseFrame = function(frame) {
  if (this.inWorker) {
    var msg = {
      type: 'release_frame',
      frame: frame
    };
    postMessage(msg, [msg.frame.buffer]);
  } else {
    this.framepool.freeFrame(frame);
  }
};
THREEcapVideo.prototype.getCompressedFrame = function(frame) {
  // convert from RGBA to RGB, and then compress with LZMA
  var newframe = this.compressedpool.getFrame();
  var olddata = frame.data;
  var newdata = newframe.data;

  for (var i = 0; i < frame.width * frame.height; i++) {
    newdata[i * 3] = olddata[i * 4];
    newdata[i * 3 + 1] = olddata[i * 4 + 1];
    newdata[i * 3 + 2] = olddata[i * 4 + 2];
  }
  //var compressed = LZMA.compress(newdata);
  return newframe;
};
THREEcapVideo.prototype.handleWorkerRequest = function(ev) {
  var msg = ev.data;
  switch (msg.type) {
    case 'add_frame':
      this.addFrame(new THREEcapFrame(msg.frame.width, msg.frame.height, msg.frame.depth, msg.frame.buffer), msg.usepool);
      break;
    case 'add_frame_base64':
      this.addFrameBase64(msg.framestr);
      break;
    case 'record':
      this.record(msg);
      break;
    case 'info':
      this.info(msg);
      break;
    case 'resize':
      this.setSize(msg.width, msg.height);
      break;
  }
};
THREEcapVideo.prototype.handleWorkerResponse = function(ev) {
  var msg = ev.data;
  switch (msg.type) {
    case 'record_results':
      this.file = msg.data;
      if (this.events.finished) {
        this.events.finished(msg.data);
      }
      this.framepool.cleanup();
      //this.compressedpool.cleanup();
      break;
    case 'release_frame':
      var frame = new THREEcapFrame(msg.frame);
      this.releaseFrame(frame);
      break;
  }
};
THREEcapVideo.prototype.device_input_open = function(stream) { 
  //console.log('INPUT DEVICE OPENED', stream); 
};
THREEcapVideo.prototype.device_input_close = function(stream) { 
  //console.log('INPUT DEVICE CLOSED', stream, this.outputpos); 
  this.processResults([ { data: this.outputbuffer.subarray(0, this.outputpos) } ]);
};
THREEcapVideo.prototype.device_input_read = (function() {
    var currframe = 0,
            framedata = null,
            curroffset = 0,
            bufsize = 1024 * 1024*1024;
    return function(stream, buffer, offset, length, position) { 
        //console.log('DEVICE IS READING', stream, buffer, offset, length, position); 

        //console.log('reading frame ' + currframe + ' of ' + this.expectedframes + ' expected (' + this.frames.length + ' queued)', length);
        if (currframe < this.expectedframes) {
            if (currframe < this.frames.length) {
              this.started = true;
              if (!framedata) {
                  //framedata = LZMA.decompress(this.frames[currframe].data);
                  framedata = this.frames[currframe].data;
              }
              

              var maxlength = Math.min(framedata.length - curroffset, bufsize, length);
              var written = 0;
              for (var i = 0; i < maxlength; i ++) {
                  buffer[offset + i] = framedata[curroffset];
                  curroffset++;
                  written++;
              }
              //console.log('stdin: frame ' + currframe + ', offset ' + curroffset, maxlength, framedata.byteLength, written);
              //curroffset += maxlength;
              if (curroffset == framedata.byteLength) {
                  //console.log('finished frame:', currframe);
                  //delete this.frames[currframe].data;
                  this.compressedpool.freeFrame(this.frames[currframe]);
                  this.frames[currframe] = false;
                  currframe++;
                  curroffset = 0;
                  framedata = false;
              }
              return written;
            } else {
                throw new this.FS.ErrnoError(11); // EAGAIN
            }
        } else if (this.started) {
            console.log('final frame reached!', currframe, this.frames.length, curroffset);
            return 0;
        }
    };
})();

THREEcapVideo.prototype.device_output_open = function(stream) { 
    //console.log('OUTPUT DEVICE OPENED', stream); 
    if (!this.outputbuffer) {
        this.blocksize = 1024 * 1024 * 10; // 10mb
        this.blockcount = 1;
        this.outputbuffer = new Uint8Array(this.blocksize);

        this.outputpos = 0;
    }
};
THREEcapVideo.prototype.device_output_close = function(stream) { 
    //console.log('OUTPUT DEVICE CLOSED', stream); 
};
THREEcapVideo.prototype.device_output_llseek = function(stream, offset, whence) { 
    //console.log('seek!', offset, whence);
    var position = offset;     // SEEK_SET

    if (whence == 1) {            // SEEK_CUR
        position += stream.position;
    } else if (whence == 2) { // SEEK_END
        position = this.outputsize - offset;
    }

    if (position < 0) {
        throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
    }
    this.outputpos = position;
    return position; 
};
THREEcapVideo.prototype.device_output_read = function(stream, buffer, offset, length, position) { 
    //console.log('OUTPUT READ????', offset, length);
};
THREEcapVideo.prototype.device_output_write = function(stream, buffer, offset, length, position) { 
    //console.log('output write: ' + length + ' bytes, ' + position + ' position, ' + offset + ' offset')
    var outputpos = (typeof position == 'number' ? position : this.outputpos);

    if (outputpos + length > this.blocksize * this.blockcount) {
      this.blockcount++;
      var newout = new Uint8Array(this.blocksize * this.blockcount);
      newout.set(this.outputbuffer);
      this.outputbuffer = newout;
      console.log('resized output buffer to ' + newout.length + ' bytes');
    }

    for (var i = 0; i < length; i++) {
        this.outputbuffer[outputpos + i] = buffer[offset + i];
    }
    this.outputsize = Math.max(this.outputsize, outputpos + length);
    this.outputpos += length;
    return length;
};
THREEcapVideo.prototype.setSize = function(width, height) {
    //console.log('SETSIZE: ' + width + 'x' + height + ' (' + (this.inWorker ? 'worker' : 'main') + ')');
    this.width = width;
    this.height = height;
    if (!this.inWorker) {
      this.framepool = new THREEcapFramePool(this.width, this.height, 4);
    }
    if (this.inWorker || !this.useWorker) {
      this.compressedpool = new THREEcapFramePool(this.width, this.height, 3);
    }

    if (this.useWorker && !this.inWorker) {
        this.worker.postMessage({type: 'resize', width: width, height: height});
    }
}

THREEcapVideo.prototype.record = function(settings) {
  if (!settings) settings = {};
  var quality = settings.quality || this.quality,
      fps = settings.fps || this.fps,
      width = settings.width || this.width,
      height = settings.height || this.height,
      time = settings.time || this.time,
      srcformat = settings.srcformat || this.srcformat,
      format = settings.format || this.format,
      canvas = settings.canvas || this.canvas,
      renderpass = settings.renderpass || this.renderpass;

  // FIXME - scaledsize needs to take source resolution as the first parameter
  var scaledsize = this.getScaledSize([width, height], [width, height]);

  width = this.width = scaledsize[0];
  height = this.height = scaledsize[1];
  this.srcformat = srcformat;
  this.format = format;
  this.canvas = canvas;

  console.log('RECORD CALLED', settings, width, height, fps, quality, time);
  this.expectedframes = fps * time;

  if (!this.inWorker) {
    this.scheduleFrames(width, height, fps, time);
  }
  
  this.setSize(width, height);

  if (this.useWorker) {
//setTimeout(function() {
    this.worker.postMessage({type: 'record', quality: quality, fps: fps, width: width, height: height, time: time, srcformat: srcformat, format: format});
//}.bind(this), time * 1000);
  } else {
    var program = {
      stdin: function() { }.bind(this),
      initDevice: function(FS, ERRNO_CODES) {
        this.FS = FS;
        var dev_input = FS.makedev(99, 88);
        var dev_output = FS.makedev(99, 89);
        FS.registerDevice(dev_input, {
          open: this.device_input_open.bind(this),
          close: this.device_input_close.bind(this),
          read: this.device_input_read.bind(this),
        });
        FS.registerDevice(dev_output, {
          open: this.device_output_open.bind(this),
          close: this.device_output_close.bind(this),
          read: this.device_output_read.bind(this),
          write: this.device_output_write.bind(this),
          llseek: this.device_output_llseek.bind(this),
        });
        FS.mkdev('/input.raw', dev_input);
        FS.mkdev('/output/output.' + format, dev_output);
      }.bind(this),
      memoryInitializerPrefixURL: this.scriptbase 
    };

    var args = [
      '-framerate', fps.toString(),
      '-s', width + 'x' + height,
    ];
    if (srcformat == 'raw') {
      args = args.concat([
        '-vcodec', 'rawvideo',
        '-f', 'rawvideo',
        '-pix_fmt', 'rgb24'
      ]);
    } else if (srcformat == 'png') {
      args = args.concat([
        '-f', 'image2pipe',
        '-vcodec', 'png',
        '-pix_fmt', 'rgb32'
      ]);
    }
    args = args.concat([
      '-i', '/input.raw',
    ]);

    if (format == 'mp4') {
      args = args.concat([
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        //'-movflags', '+faststart',
        '-preset', quality,
      ]);
    } else if (format == 'gif') {
      args = args.concat([
        '-c:v', 'gif',
      ]);
    } else if (format == 'raw') {
      args = args.concat([
        '-vcodec', 'rawvideo',
        '-pix_fmt', 'rgb24',
      ]);
      format = 'mov';
    }
    args.push('-y');
    args.push('output.' + format);

    program.arguments = args;

    console.log('RUN FFMPEG', args);
    try {
      ffmpeg_run(program);
    } catch (e) {
    }

  }
};

THREEcapVideo.prototype.scheduleFrames = function(width, height, fps, time) {
  var delay = 1000 / fps;
  var numframes = time * fps;
  var framepromises = [];
  for (var i = 0; i < numframes; i++) {
    var promise = this.scheduleFrame(width, height, i, delay * i);
    framepromises.push(promise);
  }
  return framepromises;
};

THREEcapVideo.prototype.scheduleFrame = function(width, height, frame, delay) {
  return new Promise(function(resolve, reject) {
    setTimeout(function() { 
      //if (this.updateCaptureData(width, height)) {
        if (this.renderpass instanceof THREEcapRenderPass) {
          var imgdata = this.addFrameFromTHREE(this.renderpass);
        } else if (this.canvas) {
          var imgdata = this.addFrameFromCanvas(this.canvas);
        }
        resolve({frame: frame, image: imgdata});
      //}
    }.bind(this), delay);
  }.bind(this));
};

THREEcapVideo.prototype.processResults = function(results) {
  if (results && results.length > 0) {
    var mimetypes = {
      'mp4': 'video/mp4',
      'gif': 'image/gif',
      'mpg': 'video/mpeg',
    };
    //var blob = new Blob([results[0].data], { type: 'video/mp4' });
    var blob = new Blob([results[0].data], { type: mimetypes[this.format] });
    if (this.inWorker) {
      var msg = {type: 'record_results', data: blob};
      postMessage(msg);
      //this.framepool.cleanup();
      this.compressedpool.cleanup();
    } else {
      this.file = blob;
      if (this.events.finished) {
        this.events.finished(blob);
      }
      this.framepool.cleanup();
      this.compressedpool.cleanup();
    }
  }
};
THREEcapVideo.prototype.info = function() {
    if (this.useWorker && !this.inWorker) {
        this.worker.postMessage({type: 'info'});
    } else {
        var args = {
            stdin: function() { }.bind(this),
            arguments: [
                '-codecs'
            ],
            memoryInitializerPrefixURL: this.scriptbase 
        };

        ffmpeg_run(args);
    }
}

THREEcapVideo.prototype.on = function(event, callback) {
  this.events[event] = callback;
};

THREEcapVideo.prototype.saveFile = function(fileName) {
    var a = document.createElement("a");
    document.body.appendChild(a);
    a.style.display = "none";

    var url = window.URL.createObjectURL(this.file);
    a.href = url;
    a.download = fileName;
    a.click();
    window.URL.revokeObjectURL(url);
  }
"use strict";
/**
 * THREEcapUI - simple video capture UI
 */
function THREEcapUI(capture) {
  this.capture = capture;
  this.settings = {
    resolution: '352x240',
    framerate: 25,
    time: 5,
    format: 'mp4',
    filename: this.getTimestampedFilename('threecap'),
  };

  this.panel = this.createPanel();
}

THREEcapUI.prototype.createPanel = function() {
  var panel = document.createElement('div');
  panel.id = 'recordpanel';

  var h2 = document.createElement('h2');
  h2.innerHTML = 'THREEcap Settings';
  panel.appendChild(h2);

  var resolutions = {
        'canvas': 'canvas', 
        '240p': '352x240', 
        '360p': '480x360', 
        '480p': '858x480', 
        '720p': '1280x720', 
        '1080p': '1920x1080', 
      },
      framerates = {
        '1 fps': 1,
        '2 fps': 2,   
        '5 fps': 5, 
        '10 fps': 10, 
        '15 fps': 15, 
        '25 fps': 25, 
        '30 fps': 30, 
        '45 fps': 45, 
        '60 fps': 60
      },
      times = {
        '5s': 5,
        '10s': 10, 
        '15s': 10,
        '30s': 30, 
        '45s': 45, 
        '1m': 60,
        '1m30s': 90,
        '2m': 120, 
        '3m': 180, 
        '4m': 240, 
        '5m': 300
      },
      formats = {'mp4': 'mp4', 'gif': 'gif', 'webm': 'webm'};

  var select_resolution = this.createDropdown('Resolution', resolutions, this.settings.resolution);
  var select_framerate = this.createDropdown('Framerate', framerates, this.settings.framerate);
  var select_time = this.createDropdown('Time', times, this.settings.time);
  var select_format = this.createDropdown('Format', formats, this.settings.format);

  var input_filename = this.createInput('Filename', this.settings.filename);

  select_resolution.addEventListener('change', this.updateRecordSetting.bind(this, 'resolution'));
  select_framerate.addEventListener('change', this.updateRecordSetting.bind(this, 'framerate'));
  select_time.addEventListener('change', this.updateRecordSetting.bind(this, 'time'));
  select_format.addEventListener('change', this.updateRecordSetting.bind(this, 'format'));
  input_filename.addEventListener('change', this.updateRecordSetting.bind(this, 'filename'));

  panel.appendChild(select_resolution);
  panel.appendChild(select_framerate);
  panel.appendChild(select_time);
  panel.appendChild(select_format);
  panel.appendChild(input_filename);

  var button = document.createElement('button');
  button.addEventListener('click', this.handleButtonClick.bind(this));
  button.innerHTML = 'Record';
  panel.appendChild(button);

  document.body.appendChild(panel);
  return panel;
}

THREEcapUI.prototype.createDropdown = function(labeltext, options, selected) {
  var container = document.createElement('div');

  var label = document.createElement('label');
  var select = document.createElement('select');

  label.innerHTML = labeltext;
  label.for = select;
  container.appendChild(label);

  var optionnames = Object.keys(options);
  
  optionnames.forEach(function(o) {
    var option = document.createElement('option');
    option.value = options[o];
    option.innerHTML = o;
    if (selected && selected == options[o]) {
      option.selected = true;
    }
    select.appendChild(option);
  });
  container.appendChild(select);

  return container;
}
THREEcapUI.prototype.createInput = function(labeltext, value) {
  var container = document.createElement('div');

  var label = document.createElement('label');
  var input = document.createElement('input');

  label.innerHTML = labeltext;
  label.for = input;
  container.appendChild(label);

  input.value = value;
  container.appendChild(input);

  return container;
}

THREEcapUI.prototype.updateRecordSetting = function(setting, ev) {
  this.settings[setting] = ev.target.value;
}
THREEcapUI.prototype.handleButtonClick = function(ev) {
  console.log('bling', this.settings);
  var button = ev.target;
  button.innerHTML = 'Recording...';
  button.className = 'state_recording';
  var res = this.settings.resolution.split('x'),
      fps = parseInt(this.settings.framerate),
      time = parseInt(this.settings.time),
      format = this.settings.format,
      fname = this.settings.filename;

  if (this.settings.resolution == 'canvas') {
    res = [renderer.domElement.width, renderer.domElement.height];
  }

  this.capture.record({
      width: res[0], 
      height: res[1],
      fps: fps,
      format: format,
      time: time
    }).then(function(video) { 
      button.innerHTML = 'Record';
      button.className = '';
      this.settings['filename'] = this.getTimestampedFilename('threecap');
      this.saveFile(fname, video.file);
    }.bind(this));
  setTimeout(function() {
    button.innerHTML = 'Encoding...';
  }, time * 1000);
}

THREEcapUI.prototype.getTimestampedFilename = function(prefix) {
  var d = new Date();
  var ts = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate() + '_' + d.getHours() + '-' + d.getMinutes() + '-' + d.getSeconds();
  return prefix + '_' + ts;
}

THREEcapUI.prototype.saveFile = function(fname, data) {
  var a = document.createElement('A');
  a.innerHTML = fname;
  recordpanel.appendChild(a);
  var url = window.URL.createObjectURL(data);

  a.href = url;
  a.download = fname;
  a.click();
console.log('click click!', a);
  //window.URL.revokeObjectURL(url);
  //document.body.removeChild(a);
}

