(() => {
  "use strict";

  const scannerScreen = document.getElementById("scannerScreen");
  const collectionScreen = document.getElementById("collectionScreen");

  const scanNavBtn = document.getElementById("scanNavBtn");
  const collectionNavBtn = document.getElementById("collectionNavBtn");
  const bottomRefreshBtn = document.getElementById("bottomRefreshBtn");
  const headerRefreshBtn = document.getElementById("headerRefreshBtn");
  const emptyScanBtn = document.getElementById("emptyScanBtn");

  const startCameraBtn = document.getElementById("startCameraBtn");
  const captureBtn = document.getElementById("captureBtn");
  const retakeBtn = document.getElementById("retakeBtn");

  const cameraPreview = document.getElementById("cameraPreview");
  const cameraPlaceholder = document.getElementById("cameraPlaceholder");
  const capturedImage = document.getElementById("capturedImage");
  const captureCanvas = document.getElementById("captureCanvas");
  const mobileCaptureInput = document.getElementById("mobileCaptureInput");
  const scanResult = document.getElementById("scanResult");

  let mediaStream = null;
  let capturedDataUrl = null;


  function showScreen(screenId) {
    const screens = [scannerScreen, collectionScreen];

    screens.forEach(screen => {
      screen.classList.toggle("active-screen", screen.id === screenId);
    });

    scanNavBtn.classList.toggle("active", screenId === "scannerScreen");
    collectionNavBtn.classList.toggle("active", screenId === "collectionScreen");

    if (screenId !== "scannerScreen") {
      stopCamera();
    }
  }


  async function startCamera() {
    resetCapture(false);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      // Fallback for browsers / mobile environments where live camera
      // access is unavailable. The input will still open the phone camera.
      mobileCaptureInput.click();
      return;
    }

    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false
      });

      cameraPreview.srcObject = mediaStream;
      cameraPreview.style.display = "block";
      cameraPlaceholder.classList.add("d-none");

      startCameraBtn.classList.add("d-none");
      retakeBtn.classList.add("d-none");
      captureBtn.classList.remove("d-none");

    } catch (error) {
      console.warn("Live camera unavailable:", error);
      mobileCaptureInput.click();
    }
  }


  function capturePhoto() {
    if (!mediaStream) return;

    const width = cameraPreview.videoWidth;
    const height = cameraPreview.videoHeight;

    if (!width || !height) return;

    captureCanvas.width = width;
    captureCanvas.height = height;

    const ctx = captureCanvas.getContext("2d");
    ctx.drawImage(cameraPreview, 0, 0, width, height);

    capturedDataUrl = captureCanvas.toDataURL("image/jpeg", 0.9);

    showCapturedImage(capturedDataUrl);
    stopCamera();
  }


  function showCapturedImage(dataUrl) {
    capturedImage.src = dataUrl;
    capturedImage.classList.remove("d-none");

    cameraPreview.style.display = "none";
    cameraPlaceholder.classList.add("d-none");

    startCameraBtn.classList.add("d-none");
    captureBtn.classList.add("d-none");
    retakeBtn.classList.remove("d-none");

    scanResult.classList.remove("d-none");

    // For Version 1, keep the latest scan in browser storage.
    // Later we can replace this with a real database record.
    try {
      localStorage.setItem("cardVaultLatestScan", dataUrl);
    } catch (error) {
      console.warn("Could not save captured image locally:", error);
    }
  }


  function handleMobileFileCapture(event) {
    const file = event.target.files?.[0];

    if (!file) return;

    const reader = new FileReader();

    reader.onload = e => {
      capturedDataUrl = e.target.result;
      showCapturedImage(capturedDataUrl);
    };

    reader.readAsDataURL(file);
  }


  function stopCamera() {
    if (!mediaStream) return;

    mediaStream.getTracks().forEach(track => track.stop());

    cameraPreview.srcObject = null;
    mediaStream = null;
  }


  function resetCapture(restartCamera = false) {
    stopCamera();

    capturedDataUrl = null;
    capturedImage.src = "";
    capturedImage.classList.add("d-none");

    cameraPreview.style.display = "none";
    cameraPlaceholder.classList.remove("d-none");

    captureBtn.classList.add("d-none");
    retakeBtn.classList.add("d-none");
    startCameraBtn.classList.remove("d-none");

    scanResult.classList.add("d-none");

    mobileCaptureInput.value = "";

    if (restartCamera) {
      startCamera();
    }
  }


  function refreshScanner() {
    showScreen("scannerScreen");
    resetCapture(false);
  }


  scanNavBtn.addEventListener("click", () => showScreen("scannerScreen"));
  collectionNavBtn.addEventListener("click", () => showScreen("collectionScreen"));

  bottomRefreshBtn.addEventListener("click", refreshScanner);
  headerRefreshBtn.addEventListener("click", refreshScanner);

  emptyScanBtn.addEventListener("click", () => {
    showScreen("scannerScreen");
  });

  startCameraBtn.addEventListener("click", startCamera);
  captureBtn.addEventListener("click", capturePhoto);
  retakeBtn.addEventListener("click", () => resetCapture(true));

  mobileCaptureInput.addEventListener("change", handleMobileFileCapture);

  window.addEventListener("beforeunload", stopCamera);
})();
