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
