export const terminalColor = (req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        const timestamp = `${colors.dim}[${new Date().toISOString()}]${colors.reset}`;
        const method = `${colors.cyan}${req.method}${colors.reset}`;
        const url = `${colors.bright}${req.hostname}${req.originalUrl}${colors.reset}`;
        
        // Color status code based on range
        let statusColor = colors.green; // Default for 2xx
        if (res.statusCode >= 400) statusColor = colors.red;
        else if (res.statusCode >= 300) statusColor = colors.yellow;
        
        const status = `${statusColor}${res.statusCode}${colors.reset}`;
        
        console.log(
            `${timestamp} ` +
            `${method} ${url} - ` +
            `Status: ${status} - ` +
            `${colors.blue}Duration: ${duration}ms${colors.reset}`
        );
    });
    
    next();
}

export const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
}