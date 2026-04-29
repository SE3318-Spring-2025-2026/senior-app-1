const Layer = require('express/lib/router/layer');

if (!Layer.prototype.__asyncErrorsPatched) {
  const originalHandleRequest = Layer.prototype.handle_request;

  Layer.prototype.handle_request = function patchedHandleRequest(req, res, next) {
    const fn = this.handle;

    if (fn.length > 3) {
      return originalHandleRequest.call(this, req, res, next);
    }

    try {
      const result = fn(req, res, next);
      if (result && typeof result.then === 'function') {
        result.catch(next);
      }
      return result;
    } catch (error) {
      return next(error);
    }
  };

  Layer.prototype.__asyncErrorsPatched = true;
}
