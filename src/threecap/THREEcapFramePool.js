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

