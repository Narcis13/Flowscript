# FlowScript Frontend Testing Interface

This directory contains the frontend testing interface for FlowScript workflows.

## Server Configuration

The FlowScript server runs on **port 3013** by default. You can override this by setting the `PORT` environment variable.

## Starting the Server

```bash
# Build the project
npm run build

# Start the server (runs on port 3013)
npm start

# Or run directly
node dist/index.js
```

## Accessing the Interface

Once the server is running, open your browser and navigate to:

- **Web Interface**: http://localhost:3013
- **API Documentation**: http://localhost:3013/api
- **Health Check**: http://localhost:3013/health

## Directory Structure

```
public/
├── index.html          # Main entry point
├── css/
│   └── app.css        # Custom styles
├── js/
│   └── app.js         # Main application (to be implemented)
└── examples/
    └── workflows/     # Example workflow JSON files
```

## Development

The frontend uses:
- **AlpineJS** for reactive UI components (CDN)
- **Bulma CSS** for styling (CDN)
- **Vanilla JavaScript** for WebSocket and API communication

No build process is required for frontend development. Simply edit the files and refresh your browser.