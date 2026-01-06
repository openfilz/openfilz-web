# OpenFilz Web UI

This project is a web application for managing documents.

## Development server

Run `npm start` for a dev server. Navigate to `http://localhost:4200/`. The app will automatically reload if you change any of the source files.

## Build

Run `npm run build` to build the project. The build artifacts will be stored in the `dist/` directory.

To build the Docker image :
```
docker build -t ghcr.io/openfilz/openfilz-web:latest .
```

To get the latest Docker image :
```
Run docker pull ghcr.io/openfilz/openfilz-web:latest
```

