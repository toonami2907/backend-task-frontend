
export const ErrorCon = (err, req, res, next) => {
  // Normalize error properties
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';
  
  // Handle specific error types
  if (err.name === 'ValidationError') {
    err.statusCode = 400;
    err.message = Object.values(err.errors).map(val => val.message).join(', ');
  }
  
  if (err.code === 11000) {
    err.statusCode = 400;
    err.message = `Duplicate value for ${Object.keys(err.keyValue)} field`;
  }
  
  if (err.name === 'JsonWebTokenError') {
    err.statusCode = 401;
    err.message = 'Invalid token. Please log in again';
  }
  
  if (err.name === 'TokenExpiredError') {
    err.statusCode = 401;
    err.message = 'Your token has expired. Please log in again';
  }


  // Production response
  if (process.env.NODE_ENV === 'production') {
    return res.status(err.statusCode).json({
      status: err.status,
      message: err.message
    });
  }

  // Development response
  return res.status(err.statusCode).json({
    status: err.status,
    message: err.message,
    stack: err.stack,
    error: err
  });
};

// Function for handling async await (unchanged unless we want to emit here too)
export const CatchAsync = (fn) => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};