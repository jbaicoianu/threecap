"use strict";
/**
 * THREEcap - EffectComposer pass for capturing and encoding a Three.js app's render output
 * Supports jpg, png, gif, and mp4 output
 * Video encoding capabilities provided by FFmpeg, cross-compiled to JavaScript using Emscripten
 */

function THREEcap(args) {
    this.events = {};
    this.frames = [];
    this.width = args.width || 320;
    this.height = args.height || 240;
    this.fps = args.fps || 25;
    this.quality = args.quality || 'veryfast';
    this.useWorker = args.useWorker || false;
    this.inWorker = args.inWorker || false;
    this.srcformat = 'raw';
    this.dstformat = 'mp4';
    this.scriptbase = args.scriptbase || '';

    console.log('new THREEcap instance', this.useWorker, this.inWorker);

    this.framepool = new THREEcapFramePool(this.width, this.height, 4);
    this.compressedpool = new THREEcapFramePool(this.width, this.height, 3);

    if (this.useWorker) {
        this.worker = new Worker(this.scriptbase + 'threecap-worker.js');
        this.worker.addEventListener('message', this.handleWorkerResponse.bind(this));
    }
}

THREEcap.prototype.getScaledSize = function(size, max, multiple) {
    var scaledsize = [this.width, this.height];
    var scale = Math.min(max[0] / size[0], max[1] / size[1]);
    if (multiple === undefined) multiple = 2;

    scaledsize[0] = Math.floor(size[0] * scale / multiple) * multiple;
    scaledsize[1] = Math.floor(size[1] * scale / multiple) * multiple;

    return scaledsize;
}

THREEcap.prototype.getFrame = function() {
    var frame = this.framepool.getFrame();
    return frame;
};
THREEcap.prototype.addFrame = function(frame, usepool) {
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
            console.log('add frame', this.frames.length, frame.width + 'x' + frame.height);
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
THREEcap.prototype.addFrameBase64 = function(framestr) {
    if (framestr) {
        if (this.useWorker && !this.inWorker) {
            var msg = {
                type: 'add_frame_base64',
                framestr: framestr
            };
            this.worker.postMessage(msg);
        } else {
            //console.log('add base64 frame', this.frames.length, framestr.length);
            var compressedframe = this.getFrame();
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

THREEcap.prototype.addFrameFromTHREE = function(renderer, target) {
    var frame = this.getFrame();
    if (target) {
        renderer.readRenderTargetPixels(target, 0, 0, target.width, target.height, frame.data);
    } else {
        var gl = renderer.getContext();
        gl.readPixels( 0, 0, renderer.width, renderer.height, gl.RGBA, gl.UNSIGNED_BYTE, frame.data );
    }
    return this.addFrame(frame, true);
};

THREEcap.prototype.addFrameFromCanvas = function(canvas) {
    this.srcformat = 'png';
    // var header = "data:image/png;base64,";
    var imgdata = canvas.toDataURL('image/png').substr(22);
    return this.addFrameBase64(imgdata, false);
};

THREEcap.prototype.getFrameFromData = function(framedata) {
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

THREEcap.prototype.releaseFrame = function(frame) {
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
THREEcap.prototype.getCompressedFrame = function(frame) {
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
THREEcap.prototype.handleWorkerRequest = function(ev) {
    var msg = ev.data;
    switch (msg.type) {
        case 'add_frame':
            this.addFrame(new THREEcapFrame(msg.frame.width, msg.frame.height, msg.frame.depth, msg.frame.buffer), msg.usepool);
            break;
        case 'add_frame_base64':
            this.addFrameBase64(msg.framestr);
            break;
        case 'render':
            this.render(msg);
            break;
        case 'info':
            this.info(msg);
            break;
        case 'resize':
            this.setSize(msg.width, msg.height);
            break;
    }
};
THREEcap.prototype.handleWorkerResponse = function(ev) {
    var msg = ev.data;
    switch (msg.type) {
        case 'render_results':
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
THREEcap.prototype.device_input_open = function(stream) { console.log('INPUT DEVICE OPENED', stream); };
THREEcap.prototype.device_input_close = function(stream) { 
    console.log('INPUT DEVICE CLOSED', stream, this.outputsize); 
    //this.processResults([ { data: this.outputbuffer.subarray(0, this.outputsize) } ]);
    var foo = this.FS.readFile('/output/output.' + this.dstformat);
    this.processResults([ { data: foo } ]);
};
THREEcap.prototype.device_input_read = (function() {
    var currframe = 0,
            framedata = null,
            curroffset = 0,
            bufsize = 1024*1024;
    return function(stream, buffer, offset, length, position) { 
        //console.log('DEVICE IS READING', stream, buffer, offset, length, position); 

        //console.log('reading frame ' + currframe + ' of ' + this.expectedframes + ' expected', length);
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
            //return 0;
        }
    };
})();

THREEcap.prototype.device_output_open = function(stream) { 
    console.log('OUTPUT DEVICE OPENED', stream); 
    this.outputpos = 0;
    if (!this.outputbuffer) {
        this.outputbuffer = new Uint8Array(1024*1024*5); // 5mb buffer
        this.outputsize = 0;
    }
};
THREEcap.prototype.device_output_close = function(stream) { 
    console.log('OUTPUT DEVICE CLOSED', stream); 
    console.log(this.outputbuffer, this.outputsize);
};
THREEcap.prototype.device_output_llseek = function(stream, offset, whence) { 
    console.log('seek!', offset, whence);
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
THREEcap.prototype.device_output_read = function(stream, buffer, offset, length, position) { 
    console.log('OUTPUT READ????', offset, length);
};
THREEcap.prototype.device_output_write = function(stream, buffer, offset, length, position) { 
    console.log('output write: ' + length + ' bytes, ' + position + ' position, ' + offset + ' offset')
    var outputpos = (typeof position == 'number' ? position : this.outputpos);
    for (var i = 0; i < length; i++) {
        this.outputbuffer[outputpos + i] = buffer[offset + i];
    }
    this.outputsize = Math.max(this.outputsize, outputpos + length);
    this.outputpos += length;
    return length;
};
THREEcap.prototype.setSize = function(width, height) {
    //console.log('SETSIZE: ' + width + 'x' + height + ' (' + (this.inWorker ? 'worker' : 'main') + ')');
    this.width = width;
    this.height = height;
    this.framepool = new THREEcapFramePool(this.width, this.height, 4);
    this.compressedpool = new THREEcapFramePool(this.width, this.height, 3);

    if (this.useWorker && !this.inWorker) {
        this.worker.postMessage({type: 'resize', width: width, height: height});
    }
}

THREEcap.prototype.render = function(settings) {
    if (!settings) settings = {};
    var quality = settings.quality || this.quality,
        fps = settings.fps || this.fps,
        width = settings.width || this.width,
        height = settings.height || this.height,
        time = settings.time || this.time,
        srcformat = settings.srcformat || this.srcformat,
        dstformat = settings.dstformat || this.dstformat;

    this.width = width;
    this.height = height;
    this.srcformat = srcformat;
    this.dstformat = dstformat;

    //this.framepool = new THREEcapFramePool(this.width, this.height, 4);
    //this.compressedpool = new THREEcapFramePool(this.width, this.height, 3);

console.log('RENDER CALLED', settings, width, height, fps, quality, time);
    this.expectedframes = fps * time;
/*
    this.currentframe = 0;
    this.outputpos = 0;
    this.frames = [];
*/
    
    if (this.useWorker) {
        this.worker.postMessage({type: 'render', quality: quality, fps: fps, width: width, height: height, time: time, srcformat: srcformat, dstformat: dstformat});
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
                //FS.mkdev('/output/output', dev_output);
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

        if (dstformat == 'mp4') {
          args = args.concat([
            '-c:v', 'libx264',
            '-pix_fmt', 'yuv420p',
            //'-movflags', '+faststart',
            '-preset', quality,
            '-y',
          ]);
        } else if (dstformat == 'gif') {
          args = args.concat([
            '-c:v', 'gif',
          ]);
        }
        args.push('output.' + dstformat);

        program.arguments = args;

        ffmpeg_run(program);

    }
};

THREEcap.prototype.processResults = function(results) {
    if (results && results.length > 0) {
        var mimetypes = {
            'mp4': 'video/mp4',
            'gif': 'image/gif',
            'mpg': 'video/mpeg',
        };
        //var blob = new Blob([results[0].data], { type: 'video/mp4' });
        var blob = new Blob([results[0].data], { type: mimetypes[this.dstformat] });
        if (this.inWorker) {
            var msg = {type: 'render_results', data: blob};
            postMessage(msg);
            //this.framepool.cleanup();
            this.compressedpool.cleanup();
        } else {
            if (this.events.finished) {
                this.events.finished(blob);
            }
            this.framepool.cleanup();
            this.compressedpool.cleanup();
        }
    }
};
THREEcap.prototype.info = function() {
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

THREEcap.prototype.on = function(event, callback) {
  this.events[event] = callback;
};

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
