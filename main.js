import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';
import { createClient } from '@supabase/supabase-js';

let scene, camera, renderer, controls, currentModel;
const loadingElement = document.getElementById('loading');

// Supabase config
const SUPABASE_URL = 'https://mpxnhhdlekvsovwpdboa.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1weG5oaGRsZWt2c292d3BkYm9hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDcwMDE3OTksImV4cCI6MjA2MjU3Nzc5OX0._sVO91H2czCZP-EORicmLaEhYafqZoatJY001ntg7MM';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const MODEL_BUCKET = 'models';
const MODEL_FILENAME = 'latest.glb';
const HDRI_BUCKET = 'hdri';
const HDRI_FILENAME_HDR = 'latest.hdr';
const HDRI_FILENAME_EXR = 'latest.exr';

// Initialize the scene
function init() {
    // Create scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x333333);

    // Create camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 5;

    // Create renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.outputEncoding = THREE.sRGBEncoding;
    document.body.appendChild(renderer.domElement);

    // Add orbit controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.enablePan = false;

    // Add lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 5, 5);
    scene.add(directionalLight);

    // Handle window resize
    window.addEventListener('resize', onWindowResize, false);

    // Handle file inputs
    const fileInput = document.getElementById('file-input');
    fileInput.addEventListener('change', handleFileSelect, false);

    const envInput = document.getElementById('env-input');
    envInput.addEventListener('change', handleEnvSelect, false);

    animate();
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        loadingElement.style.display = 'block';
        loadingElement.textContent = 'Uploading and loading model...';
        // Upload to Supabase first
        supabase.storage.from(MODEL_BUCKET).upload(MODEL_FILENAME, file, { upsert: true })
            .then(async ({ error }) => {
                if (error) {
                    console.error('Upload error:', error);
                    loadingElement.style.display = 'none';
                    return;
                }
                // After upload, fetch and display
                const { data, error: downloadError } = await supabase.storage.from(MODEL_BUCKET).download(MODEL_FILENAME);
                if (data) {
                    const blob = await data.blob();
                    loadGLBModelFromBlob(blob);
                }
                loadingElement.style.display = 'none';
            });
    }
}

// Notification helper
function showNotification(message, timeout = 4000) {
    const notif = document.getElementById('notification');
    notif.textContent = message;
    notif.style.display = 'block';
    clearTimeout(notif._timeout);
    notif._timeout = setTimeout(() => {
        notif.style.display = 'none';
    }, timeout);
}

// Helper to sanitize URLs (remove double slashes except after protocol)
function sanitizeUrl(url) {
    return url.replace(/([^:]\/)\/+/, '$1');
}

// On app load, check which HDRI file exists and only try to load that one
async function tryLoadHdriSmart() {
    try {
        const { data, error } = await supabase.storage.from(HDRI_BUCKET).list('', { limit: 2 });
        if (error) {
            showNotification('Error listing HDRI bucket: ' + error.message);
            return;
        }
        let found = false;
        if (data && Array.isArray(data)) {
            for (const file of data) {
                if (file.name === 'latest.hdr' || file.name === 'latest.exr') {
                    const ext = file.name.split('.').pop();
                    const { data: urlData } = supabase.storage.from(HDRI_BUCKET).getPublicUrl(file.name);
                    if (urlData && urlData.publicUrl) {
                        let url = sanitizeUrl(urlData.publicUrl);
                        loadHdriFromUrl(url, ext);
                        found = true;
                        break;
                    }
                }
            }
        }
        if (!found) {
            showNotification('No HDRI file found in bucket.');
        }
    } catch (e) {
        showNotification('Error loading HDRI: ' + e.message);
    }
}

function handleEnvSelect(event) {
    const file = event.target.files[0];
    if (file) {
        loadingElement.style.display = 'block';
        loadingElement.textContent = 'Uploading and loading environment map...';
        const extension = file.name.split('.').pop().toLowerCase();
        let supabaseFilename = '';
        if (extension === 'hdr') {
            supabaseFilename = HDRI_FILENAME_HDR;
        } else if (extension === 'exr') {
            supabaseFilename = HDRI_FILENAME_EXR;
        } else {
            loadingElement.style.display = 'none';
            showNotification('Unsupported file type for environment map.');
            return;
        }
        // Upload to Supabase
        supabase.storage.from(HDRI_BUCKET).upload(supabaseFilename, file, { upsert: true })
            .then(async ({ error }) => {
                if (error) {
                    console.error('HDRI upload error:', error);
                    loadingElement.style.display = 'none';
                    showNotification('HDRI upload error: ' + error.message);
                    return;
                }
                // After upload, get public URL and load only the just-uploaded file
                const { data } = supabase.storage.from(HDRI_BUCKET).getPublicUrl(supabaseFilename);
                if (data && data.publicUrl) {
                    showNotification('HDRI uploaded. Loading...');
                    let url = sanitizeUrl(data.publicUrl);
                    loadHdriFromUrl(url, extension);
                } else {
                    showNotification('Failed to get public URL for uploaded HDRI.');
                }
                loadingElement.style.display = 'none';
            });
    }
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

// Start the application
init();

// On app load, try to fetch and display the latest model from Supabase
window.addEventListener('DOMContentLoaded', async () => {
    loadingElement.style.display = 'block';
    loadingElement.textContent = 'Loading latest model...';
    const { data, error } = supabase.storage.from(MODEL_BUCKET).getPublicUrl(MODEL_FILENAME);
    if (data && data.publicUrl) {
        loadGLBModelFromUrl(data.publicUrl);
    } else {
        console.error('Could not get public URL for latest model:', error);
    }
    loadingElement.style.display = 'none';

    tryLoadHdriSmart();
});

// Helper to load a GLB model from a URL
function loadGLBModelFromUrl(url) {
    // Remove current model if it exists
    if (currentModel) {
        scene.remove(currentModel);
    }
    const loader = new GLTFLoader();
    loader.load(
        url,
        (gltf) => {
            currentModel = gltf.scene;
            // Center and scale the model
            const box = new THREE.Box3().setFromObject(currentModel);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);
            const scale = 2 / maxDim;
            currentModel.scale.multiplyScalar(scale);
            currentModel.position.sub(center.multiplyScalar(scale));
            const pivot = new THREE.Group();
            pivot.add(currentModel);
            pivot.rotation.x = Math.PI / 2;
            scene.add(pivot);
            currentModel = pivot;
        },
        undefined,
        (error) => {
            console.error('An error happened loading model from URL:', error);
        }
    );
}

// Helper to load a GLB model from a Blob
function loadGLBModelFromBlob(blob) {
    // Remove current model if it exists
    if (currentModel) {
        scene.remove(currentModel);
    }
    const loader = new GLTFLoader();
    const url = URL.createObjectURL(blob);
    loader.load(
        url,
        (gltf) => {
            currentModel = gltf.scene;
            // Center and scale the model
            const box = new THREE.Box3().setFromObject(currentModel);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);
            const scale = 2 / maxDim;
            currentModel.scale.multiplyScalar(scale);
            currentModel.position.sub(center.multiplyScalar(scale));
            const pivot = new THREE.Group();
            pivot.add(currentModel);
            pivot.rotation.x = Math.PI / 2;
            scene.add(pivot);
            currentModel = pivot;
        },
        undefined,
        (error) => {
            console.error('An error happened:', error);
        }
    );
}

// Helper to load HDRI from a URL
function loadHdriFromUrl(url, type) {
    // Sanitize the URL
    url = sanitizeUrl(url);
    loadingElement.style.display = 'block';
    loadingElement.textContent = 'Loading environment map...';
    if (type === 'hdr') {
        const rgbeLoader = new RGBELoader();
        rgbeLoader.load(url, (texture) => {
            texture.mapping = THREE.EquirectangularReflectionMapping;
            scene.environment = texture;
            scene.background = texture;
            loadingElement.style.display = 'none';
        });
    } else if (type === 'exr') {
        const exrLoader = new EXRLoader();
        exrLoader.load(url, (texture) => {
            texture.mapping = THREE.EquirectangularReflectionMapping;
            scene.environment = texture;
            scene.background = texture;
            loadingElement.style.display = 'none';
        });
    }
}

// --- Supabase Auth for /login route ---
if (window.location.pathname === '/login') {
    document.getElementById('login-container').style.display = 'flex';
    document.body.style.overflow = 'hidden';
    const loginForm = document.getElementById('login-form');
    const loginError = document.getElementById('login-error');
    loginForm.onsubmit = async (e) => {
        e.preventDefault();
        loginError.style.display = 'none';
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
            loginError.textContent = error.message;
            loginError.style.display = 'block';
        } else {
            loginError.style.display = 'none';
            showNotification('Login successful! Redirecting...');
            setTimeout(() => {
                window.location.href = '/upload';
            }, 1200);
        }
    };
    // Hide rest of app UI
    document.getElementById('upload-page').style.display = 'none';
    document.getElementById('loading').style.display = 'none';
    if (document.getElementById('notification')) document.getElementById('notification').style.display = 'none';
} else if (window.location.pathname === '/upload') {
    // Restrict /upload to authenticated users only
    supabase.auth.getSession().then(({ data: { session } }) => {
        if (!session) {
            window.location.href = '/login';
        } else {
            document.getElementById('upload-page').style.display = 'flex';
            document.body.style.overflow = 'auto';
            // Hide viewer UI
            document.getElementById('login-container').style.display = 'none';
            document.getElementById('loading').style.display = 'none';
            if (document.getElementById('notification')) document.getElementById('notification').style.display = 'none';
        }
    });
} else {
    // Hide upload UI on main viewer page
    document.getElementById('upload-page').style.display = 'none';
} 