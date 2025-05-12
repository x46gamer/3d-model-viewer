# 3D Model Viewer

A simple web-based 3D model viewer that can load and display GLB files using Three.js, with support for HDR/EXR environment maps.

## Features

- Load and view GLB 3D model files
- Support for HDR and EXR environment maps
- Realistic lighting and reflections
- Orbit controls for model manipulation
- Automatic model centering and scaling
- Responsive design
- Loading indicator

## Setup

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm start
```

3. Open your browser and navigate to `http://localhost:5173`

## Usage

1. Click the "Choose GLB File" button to load a 3D model
2. Click the "Load Environment Map" button to load an HDR or EXR environment map
3. The model will be displayed with the environment map as both background and lighting
4. Use your mouse to:
   - Left click and drag to rotate the model
   - Right click and drag to pan
   - Scroll to zoom in/out

## Environment Maps

The viewer supports both HDR and EXR format environment maps. These files will:
- Set the background of the scene
- Provide realistic lighting and reflections on the 3D model
- Create a more immersive viewing experience

You can find free HDR/EXR environment maps from various sources online, such as:
- HDRI Haven
- Poly Haven
- OpenFootage

## Requirements

- Node.js (v14 or higher)
- Modern web browser with WebGL support 