/**
 * @author James Baicoianu / http://www.baicoianu.com/
 */


function THREEcapPass() {

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

	this.threecap = new THREEcap({useWorker: true, quality: 'veryfast', fps: 30, scriptbase: 'js/threecap/'});
};

THREEcapPass.prototype = {

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

	getCaptureData: function(width, height) {
		var readBuffer = this.lastframe;
		var imgdata = false;
		if (readBuffer) {
			var target = this.recordtarget;
      var size = [width, height];
			if (target.width != size[0] || target.height != size[1]) {
				target.setSize(size[0], size[1]);
			}
			this.uniforms[ "tDiffuse" ].value = readBuffer;
			this.quad.material = this.flipmaterial;
			this.renderer.render( this.scene, this.camera, target, false );

      imgdata = this.threecap.getFrame();
			this.renderer.readRenderTargetPixels(target, 0, 0, size[0], size[1], imgdata.data);
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
	captureGIF: function(width, height, frames, delay) {
		return new Promise(function(resolve, reject) {
			var framepromises = [];
			for (var i = 0; i < frames; i++) {
				framepromises.push(this.scheduleGIFframe(width, height, i, delay * i));
			}
			Promise.all(framepromises).then(function(frames) {
				var start = performance.now();
				var gif = new GIF({workers: 2, quality: 10});
				for (var i = 0; i < frames.length; i++) {
					gif.addFrame(frames[i].image, {delay: (i == frames.length - 1 ? delay * 8 : delay)});
				}
				gif.on('finished', function(blob) {
					var end = performance.now();
					resolve({image: blob, time: end - start});
				});
				gif.render();
			});
		}.bind(this));
	},
	scheduleGIFframe: function(width, height, frame, delay) {
		return new Promise(function(resolve, reject) {
			setTimeout(function() { 
				//console.log('get frame', frame);
				var imgdata = this.getCaptureData(width, height);
				if (imgdata) {
					resolve({frame: frame, image: imgdata});
				} else {
					reject();
				}
			}.bind(this), delay);
		}.bind(this));
	},
	captureMP4: function(width, height, fps, time) {
		var delay = 1000 / fps;
		var numframes = time * fps;
		return new Promise(function(resolve, reject) {
			var framepromises = [];
      var threecap = this.threecap;
      var size = this.threecap.getScaledSize([this.lastframe.width, this.lastframe.height], [width, height]);
      threecap.setSize(size[0], size[1]);
console.log('size yeah!', size);
      /* FIXME - there's got to be a better way to schedule frames */
			for (var i = 0; i < numframes; i++) {
				var promise = this.scheduleGIFframe(size[0], size[1], i, delay * i);
				framepromises.push(promise);
				promise.then(function(framedata) {
					threecap.addFrame(framedata.image);
				});
			}
      var startframe = Math.min(1, framepromises.length-1);
			framepromises[startframe].then(function(f) {
				var start = performance.now();
				threecap.on('finished', function(blob) {
					var end = performance.now();
					resolve({file: blob, time: end - start});
				});
console.log('FIRST', width, height, f.image.data.length, f.image, f.image.width, f.image.height);
				threecap.render({
          width: f.image.width,
          height: f.image.height,
          fps: fps,
          time: time,
          quality: 'ultrafast'
        });
			});
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
	},
  saveFile: function(data, fileName) {
    var a = document.createElement("a");
    document.body.appendChild(a);
    a.style.display = "none";

    var url = window.URL.createObjectURL(data);
    a.href = url;
    a.download = fileName;
    a.click();
    window.URL.revokeObjectURL(url);
  }
};
