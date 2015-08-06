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


