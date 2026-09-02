(() => {
  "use strict";

  /*
    CARD VAULT - app.js
    Front-end controller for:
    Scan -> eBay lookup -> match confirmation -> detail confirmation -> IndexedDB collection.

    IMPORTANT:
    GitHub Pages is static hosting. Do NOT put your eBay Client Secret in this file.
    Point API_BASE_URL at a secure serverless bridge when we create it.

    Expected bridge endpoints:
      POST {API_BASE_URL}/identify
        body: { image: "<base64 jpeg without data-url prefix>" }
        returns:
        {
          "matches": [
            {
              "itemId": "...",
              "title": "...",
              "image": "https://...",
              "price": 12.34,
              "condition": "Ungraded",
              "itemWebUrl": "https://...",
              "categoryId": "..."
            }
          ]
        }

      POST {API_BASE_URL}/price
        body: { itemId, title, categoryId }
        returns:
        {
          "estimate": 12.34,
          "count": 18,
          "low": 8.99,
          "high": 19.99,
          "details": {
            "title": "...",
            "sport": "Baseball",
            "year": "2024",
            "player": "...",
            "set": "...",
            "cardNumber": "...",
            "condition": "...",
            "parallel": "..."
          }
        }
  */

  
  // ============================================================
  // CONFIG
  // ============================================================

 const API_BASE_URL = "https://cardvault-api.wallylong5.workers.dev";

  const MAX_IMAGE_EDGE = 1400;
  const JPEG_QUALITY = 0.86;

  const DB_NAME = "CardVaultDatabase";
  const DB_VERSION = 1;
  const STORE_NAME = "cards";

  // ============================================================
  // DOM HELPERS
  // ============================================================

  const $ = (id) => document.getElementById(id);

  const dom = {
    // screens
    scannerScreen: $("scannerScreen"),
    lookupScreen: $("lookupScreen"),
    matchScreen: $("matchScreen"),
    detailsScreen: $("detailsScreen"),
    collectionScreen: $("collectionScreen"),

    // navigation
    scanNavBtn: $("scanNavBtn"),
    collectionNavBtn: $("collectionNavBtn"),
    bottomRefreshBtn: $("bottomRefreshBtn"),
    headerRefreshBtn: $("headerRefreshBtn"),
    emptyScanBtn: $("emptyScanBtn"),

    // camera
    startCameraBtn: $("startCameraBtn"),
    captureBtn: $("captureBtn"),
    retakeBtn: $("retakeBtn"),
    cameraPreview: $("cameraPreview"),
    cameraPlaceholder: $("cameraPlaceholder"),
    capturedImage: $("capturedImage"),
    captureCanvas: $("captureCanvas"),
    mobileCaptureInput: $("mobileCaptureInput"),

    // lookup
    lookupTitle: $("lookupTitle"),
    lookupMessage: $("lookupMessage"),
    lookupError: $("lookupError"),
    lookupRetryBtn: $("lookupRetryBtn"),

    // match
    candidateImage: $("candidateImage"),
    candidateTitle: $("candidateTitle"),
    candidatePrice: $("candidatePrice"),
    candidateCondition: $("candidateCondition"),
    candidateLink: $("candidateLink"),
    matchPosition: $("matchPosition"),
    confirmMatchBtn: $("confirmMatchBtn"),
    nextMatchBtn: $("nextMatchBtn"),
    scanAgainBtn: $("scanAgainBtn"),

    // details
    detailsPhoto: $("detailsPhoto"),
    marketEstimateDisplay: $("marketEstimateDisplay"),
    marketMatchCount: $("marketMatchCount"),
    cardDetailsForm: $("cardDetailsForm"),
    cardTitle: $("cardTitle"),
    cardSport: $("cardSport"),
    cardYear: $("cardYear"),
    cardPlayer: $("cardPlayer"),
    cardSet: $("cardSet"),
    cardNumber: $("cardNumber"),
    cardCondition: $("cardCondition"),
    cardParallel: $("cardParallel"),
    cardValue: $("cardValue"),
    backToMatchesBtn: $("backToMatchesBtn"),

    // collection
    totalCards: $("totalCards"),
    totalValue: $("totalValue"),
    collectionCount: $("collectionCount"),
    emptyCollection: $("emptyCollection"),
    collectionList: $("collectionList")
  };

  const requiredIds = [
    "scannerScreen",
    "lookupScreen",
    "matchScreen",
    "detailsScreen",
    "collectionScreen",
    "scanNavBtn",
    "collectionNavBtn",
    "bottomRefreshBtn",
    "headerRefreshBtn",
    "startCameraBtn",
    "captureBtn",
    "retakeBtn",
    "cameraPreview",
    "cameraPlaceholder",
    "capturedImage",
    "captureCanvas",
    "mobileCaptureInput",
    "lookupTitle",
    "lookupMessage",
    "lookupError",
    "lookupRetryBtn",
    "candidateImage",
    "candidateTitle",
    "candidatePrice",
    "candidateCondition",
    "candidateLink",
    "matchPosition",
    "confirmMatchBtn",
    "nextMatchBtn",
    "scanAgainBtn",
    "detailsPhoto",
    "marketEstimateDisplay",
    "marketMatchCount",
    "cardDetailsForm",
    "cardTitle",
    "cardSport",
    "cardYear",
    "cardPlayer",
    "cardSet",
    "cardNumber",
    "cardCondition",
    "cardParallel",
    "cardValue",
    "backToMatchesBtn",
    "totalCards",
    "totalValue",
    "collectionCount",
    "emptyCollection",
    "collectionList"
  ];

  const missingIds = requiredIds.filter((id) => !$(id));

  if (missingIds.length) {
    console.error(
      "Card Vault cannot start because these HTML IDs are missing:",
      missingIds.join(", ")
    );
    return;
  }

  const screens = [
    dom.scannerScreen,
    dom.lookupScreen,
    dom.matchScreen,
    dom.detailsScreen,
    dom.collectionScreen
  ];

  // ============================================================
  // APP STATE
  // ============================================================

  let mediaStream = null;
  let capturedDataUrl = "";
  let ebayMatches = [];
  let currentMatchIndex = 0;
  let selectedMatch = null;

  let marketData = {
    estimate: 0,
    count: 0,
    low: 0,
    high: 0
  };

  // ============================================================
  // SCREEN / NAVIGATION
  // ============================================================

  function showScreen(screenId) {
    screens.forEach((screen) => {
      screen.classList.toggle("active-screen", screen.id === screenId);
    });

    dom.scanNavBtn.classList.toggle(
      "active",
      screenId !== "collectionScreen"
    );

    dom.collectionNavBtn.classList.toggle(
      "active",
      screenId === "collectionScreen"
    );

    if (screenId !== "scannerScreen") {
      stopCamera();
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ============================================================
  // CAMERA
  // ============================================================

  async function startCamera() {
    resetCapture(false);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      dom.mobileCaptureInput.click();
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

      dom.cameraPreview.srcObject = mediaStream;
      await dom.cameraPreview.play();

      dom.cameraPreview.style.display = "block";
      dom.cameraPlaceholder.classList.add("d-none");
      dom.startCameraBtn.classList.add("d-none");
      dom.captureBtn.classList.remove("d-none");
      dom.retakeBtn.classList.add("d-none");
    } catch (error) {
      console.warn("Live camera unavailable. Opening phone camera fallback.", error);
      dom.mobileCaptureInput.click();
    }
  }

  function stopCamera() {
    if (!mediaStream) return;

    mediaStream.getTracks().forEach((track) => track.stop());
    dom.cameraPreview.srcObject = null;
    mediaStream = null;
  }

  async function capturePhoto() {
    if (!mediaStream) return;

    const width = dom.cameraPreview.videoWidth;
    const height = dom.cameraPreview.videoHeight;

    if (!width || !height) {
      showLookupError("The camera was not ready. Please try the photo again.");
      return;
    }

    dom.captureCanvas.width = width;
    dom.captureCanvas.height = height;

    const ctx = dom.captureCanvas.getContext("2d");

    ctx.drawImage(
      dom.cameraPreview,
      0,
      0,
      width,
      height
    );

    const original = dom.captureCanvas.toDataURL(
      "image/jpeg",
      JPEG_QUALITY
    );

    stopCamera();

    capturedDataUrl = await resizeDataUrl(
      original,
      MAX_IMAGE_EDGE,
      JPEG_QUALITY
    );

    showCapturedImage(capturedDataUrl);

    // Immediately move into identification.
    await beginIdentification();
  }

  async function handleMobileFileCapture(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    try {
      capturedDataUrl = await fileToOptimizedDataUrl(
        file,
        MAX_IMAGE_EDGE,
        JPEG_QUALITY
      );

      showCapturedImage(capturedDataUrl);

      // Immediately move into identification.
      await beginIdentification();
    } catch (error) {
      console.error(error);
      alert("Card Vault could not read that photo. Please try again.");
    }
  }

  function showCapturedImage(dataUrl) {
    dom.capturedImage.src = dataUrl;
    dom.capturedImage.classList.remove("d-none");

    dom.cameraPreview.style.display = "none";
    dom.cameraPlaceholder.classList.add("d-none");

    dom.startCameraBtn.classList.add("d-none");
    dom.captureBtn.classList.add("d-none");
    dom.retakeBtn.classList.remove("d-none");
  }

  // ============================================================
  // IMAGE OPTIMIZATION
  // ============================================================

  function fileToOptimizedDataUrl(file, maxEdge, quality) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onerror = () => reject(new Error("Could not read image."));
      reader.onload = async () => {
        try {
          const result = await resizeDataUrl(
            reader.result,
            maxEdge,
            quality
          );
          resolve(result);
        } catch (error) {
          reject(error);
        }
      };

      reader.readAsDataURL(file);
    });
  }

  function resizeDataUrl(dataUrl, maxEdge, quality) {
    return new Promise((resolve, reject) => {
      const img = new Image();

      img.onload = () => {
        let width = img.naturalWidth;
        let height = img.naturalHeight;

        if (!width || !height) {
          reject(new Error("Invalid image size."));
          return;
        }

        const longest = Math.max(width, height);

        if (longest > maxEdge) {
          const scale = maxEdge / longest;
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d", {
          alpha: false
        });

        ctx.drawImage(img, 0, 0, width, height);

        resolve(
          canvas.toDataURL(
            "image/jpeg",
            quality
          )
        );
      };

      img.onerror = () => reject(new Error("Could not decode image."));
      img.src = dataUrl;
    });
  }

  function getBase64Image(dataUrl) {
    const comma = dataUrl.indexOf(",");
    return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  }

  // ============================================================
  // LOOKUP UI
  // ============================================================

  function setLookupState(title, message) {
    dom.lookupTitle.textContent = title;
    dom.lookupMessage.textContent = message;
    dom.lookupError.classList.add("d-none");
    dom.lookupRetryBtn.classList.add("d-none");
  }

  function showLookupError(message) {
    showScreen("lookupScreen");

    dom.lookupTitle.textContent = "We hit a problem";
    dom.lookupMessage.textContent =
      "Your photo is still available. You can try again without rescanning.";

    dom.lookupError.textContent = message;
    dom.lookupError.classList.remove("d-none");
    dom.lookupRetryBtn.classList.remove("d-none");
  }

  // ============================================================
  // SECURE API BRIDGE
  // ============================================================

  async function apiPost(endpoint, payload) {
    if (!API_BASE_URL) {
      throw new Error(
        "The scanner flow is working, but the secure eBay connection has not been added yet."
      );
    }

    const base = API_BASE_URL.replace(/\/+$/, "");
    const path = endpoint.startsWith("/") ? endpoint : "/" + endpoint;

    let response;

    try {
      response = await fetch(base + path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
    } catch (error) {
      throw new Error(
        "Card Vault could not reach the eBay bridge. Check your internet connection and bridge URL."
      );
    }

    let data = {};

    try {
      data = await response.json();
    } catch (_) {
      // If the bridge returned non-JSON, give a cleaner error below.
    }

    if (!response.ok) {
      throw new Error(
        data.message ||
        data.error ||
        "eBay lookup returned an error."
      );
    }

    return data;
  }

  // ============================================================
  // IDENTIFICATION FLOW
  // ============================================================

  async function beginIdentification() {
    if (!capturedDataUrl) {
      refreshScanner();
      return;
    }

    showScreen("lookupScreen");

    setLookupState(
      "Searching eBay…",
      "Comparing your card photo with eBay listings."
    );

    try {
      const data = await apiPost("/identify", {
        image: getBase64Image(capturedDataUrl)
      });

      ebayMatches = Array.isArray(data.matches)
        ? data.matches
        : [];

      if (!ebayMatches.length) {
        throw new Error(
          "No confident card matches were returned. Try a clearer photo with the card filling the frame."
        );
      }

      currentMatchIndex = 0;
      renderCurrentMatch();
      showScreen("matchScreen");
    } catch (error) {
      console.error(error);
      showLookupError(error.message);
    }
  }

  function renderCurrentMatch() {
    const match = ebayMatches[currentMatchIndex];

    if (!match) {
      showLookupError("No card match is available.");
      return;
    }

    dom.candidateImage.src =
      match.image ||
      capturedDataUrl;

    dom.candidateTitle.textContent =
      match.title ||
      "Unknown card";

    dom.candidatePrice.textContent =
      formatCurrency(match.price);

    dom.candidateCondition.textContent =
      match.condition ||
      "Not specified";

    dom.matchPosition.textContent =
      "Match " +
      (currentMatchIndex + 1) +
      " of " +
      ebayMatches.length;

    if (match.itemWebUrl) {
      dom.candidateLink.href = match.itemWebUrl;
      dom.candidateLink.classList.remove("d-none");
    } else {
      dom.candidateLink.removeAttribute("href");
      dom.candidateLink.classList.add("d-none");
    }
  }

  function showNextMatch() {
    if (!ebayMatches.length) return;

    currentMatchIndex =
      (currentMatchIndex + 1) % ebayMatches.length;

    renderCurrentMatch();
  }

  async function acceptCurrentMatch() {
    selectedMatch = ebayMatches[currentMatchIndex];

    if (!selectedMatch) return;

    showScreen("lookupScreen");

    setLookupState(
      "Checking card details…",
      "Gathering pricing information and comparable eBay listings."
    );

    try {
      const data = await apiPost("/price", {
        itemId: selectedMatch.itemId || "",
        title: selectedMatch.title || "",
        categoryId: selectedMatch.categoryId || ""
      });

      marketData = {
        estimate: Number(data.estimate) || 0,
        count: Number(data.count) || 0,
        low: Number(data.low) || 0,
        high: Number(data.high) || 0
      };

      populateCardDetails(data.details || {});
    } catch (error) {
      console.warn(
        "Detailed pricing lookup failed. Using visible image-search match prices.",
        error
      );

      marketData = estimateFromImageMatches();
      populateCardDetails({});
    }

    showScreen("detailsScreen");
  }

  function estimateFromImageMatches() {
    const prices = ebayMatches
      .map((item) => Number(item.price))
      .filter((price) => Number.isFinite(price) && price > 0)
      .sort((a, b) => a - b);

    if (!prices.length) {
      return {
        estimate: 0,
        count: 0,
        low: 0,
        high: 0
      };
    }

    const middle = Math.floor(prices.length / 2);

    const median =
      prices.length % 2
        ? prices[middle]
        : (prices[middle - 1] + prices[middle]) / 2;

    return {
      estimate: median,
      count: prices.length,
      low: prices[0],
      high: prices[prices.length - 1]
    };
  }

  // ============================================================
  // DETAILS
  // ============================================================

  function populateCardDetails(details) {
    const parsed = parseTitle(
      (selectedMatch && selectedMatch.title) || ""
    );

    dom.detailsPhoto.src = capturedDataUrl;

    dom.cardTitle.value =
      details.title ||
      (selectedMatch && selectedMatch.title) ||
      "";

    setSelectValue(
      dom.cardSport,
      details.sport || parsed.sport || ""
    );

    dom.cardYear.value =
      details.year ||
      parsed.year ||
      "";

    dom.cardPlayer.value =
      details.player ||
      parsed.player ||
      "";

    dom.cardSet.value =
      details.set ||
      parsed.set ||
      "";

    dom.cardNumber.value =
      details.cardNumber ||
      parsed.cardNumber ||
      "";

    dom.cardCondition.value =
      details.condition ||
      (selectedMatch && selectedMatch.condition) ||
      "";

    dom.cardParallel.value =
      details.parallel ||
      parsed.parallel ||
      "";

    dom.cardValue.value =
      marketData.estimate > 0
        ? marketData.estimate.toFixed(2)
        : "";

    dom.marketEstimateDisplay.textContent =
      marketData.estimate > 0
        ? formatCurrency(marketData.estimate)
        : "—";

    dom.marketMatchCount.textContent =
      marketData.count > 0
        ? String(marketData.count)
        : "—";
  }

  function parseTitle(title) {
    const clean = String(title || "").replace(/\s+/g, " ").trim();

    const yearMatch = clean.match(/\b(19|20)\d{2}\b/);
    const cardNumberMatch = clean.match(/#\s*([A-Za-z0-9-]+)/i);

    let sport = "";

    if (/\bbaseball\b/i.test(clean)) sport = "Baseball";
    else if (/\bfootball\b/i.test(clean)) sport = "Football";
    else if (/\bbasketball\b/i.test(clean)) sport = "Basketball";
    else if (/\bhockey\b/i.test(clean)) sport = "Hockey";
    else if (/\bsoccer\b/i.test(clean)) sport = "Soccer";

    let parallel = "";

    const parallelWords = [
      "refractor",
      "prizm",
      "silver",
      "gold",
      "orange",
      "red",
      "blue",
      "green",
      "purple",
      "pink",
      "aqua",
      "sepia",
      "negative",
      "x-fractor",
      "superfractor",
      "wave",
      "shimmer",
      "sapphire"
    ];

    const parallelRegex = new RegExp(
      "\\b(" + parallelWords.join("|") + ")\\b",
      "i"
    );

    const parallelMatch = clean.match(parallelRegex);

    if (parallelMatch) {
      parallel = parallelMatch[1];
    }

    return {
      year: yearMatch ? yearMatch[0] : "",
      cardNumber: cardNumberMatch ? cardNumberMatch[1] : "",
      sport,
      player: "",
      set: "",
      parallel
    };
  }

  function setSelectValue(select, value) {
    if (!select || !value) return;

    const normalized = String(value).toLowerCase();

    const option = Array.from(select.options).find(
      (item) => item.value.toLowerCase() === normalized ||
                item.text.toLowerCase() === normalized
    );

    if (option) {
      select.value = option.value;
    }
  }

  // ============================================================
  // INDEXEDDB
  // ============================================================

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(
        DB_NAME,
        DB_VERSION
      );

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(
            STORE_NAME,
            {
              keyPath: "id",
              autoIncrement: true
            }
          );

          store.createIndex(
            "dateAdded",
            "dateAdded",
            { unique: false }
          );

          store.createIndex(
            "player",
            "player",
            { unique: false }
          );

          store.createIndex(
            "sport",
            "sport",
            { unique: false }
          );
        }
      };

      request.onsuccess = (event) => {
        resolve(event.target.result);
      };

      request.onerror = (event) => {
        reject(event.target.error);
      };
    });
  }

  async function saveCard(card) {
    const db = await openDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(
        STORE_NAME,
        "readwrite"
      );

      const store = transaction.objectStore(
        STORE_NAME
      );

      const request = store.add(card);

      request.onsuccess = () => resolve();
      request.onerror = (event) => reject(event.target.error);

      transaction.oncomplete = () => db.close();
    });
  }

  async function getCards() {
    const db = await openDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(
        STORE_NAME,
        "readonly"
      );

      const store = transaction.objectStore(
        STORE_NAME
      );

      const request = store.getAll();

      request.onsuccess = (event) => {
        resolve(event.target.result || []);
      };

      request.onerror = (event) => {
        reject(event.target.error);
      };

      transaction.oncomplete = () => db.close();
    });
  }

  async function deleteCard(id) {
    const db = await openDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(
        STORE_NAME,
        "readwrite"
      );

      const store = transaction.objectStore(
        STORE_NAME
      );

      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = (event) => reject(event.target.error);

      transaction.oncomplete = () => db.close();
    });
  }

  // ============================================================
  // SAVE CONFIRMED CARD
  // ============================================================

  async function handleCardSubmit(event) {
    event.preventDefault();

    const now = new Date().toISOString();

    const card = {
      title: dom.cardTitle.value.trim(),
      sport: dom.cardSport.value,
      year: dom.cardYear.value.trim(),
      player: dom.cardPlayer.value.trim(),
      set: dom.cardSet.value.trim(),
      cardNumber: dom.cardNumber.value.trim(),
      condition: dom.cardCondition.value.trim(),
      parallel: dom.cardParallel.value.trim(),
      value: Number(dom.cardValue.value) || 0,

      image: capturedDataUrl,

      ebayReferenceImage:
        (selectedMatch && selectedMatch.image) || "",

      ebayItemId:
        (selectedMatch && selectedMatch.itemId) || "",

      ebayUrl:
        (selectedMatch && selectedMatch.itemWebUrl) || "",

      ebayMatchCount: marketData.count,
      ebayLow: marketData.low,
      ebayHigh: marketData.high,

      valueSource: "eBay Market Estimate",
      valuationDate: now,
      dateAdded: now
    };

    if (!card.title) {
      dom.cardTitle.focus();
      return;
    }

    try {
      await saveCard(card);
      await renderCollection();

      resetCapture(false);
      showScreen("collectionScreen");
    } catch (error) {
      console.error(error);

      alert(
        "Card Vault could not save this card on the device. " +
        "The browser may be low on storage."
      );
    }
  }

  // ============================================================
  // COLLECTION
  // ============================================================

  async function renderCollection() {
    let cards = [];

    try {
      cards = await getCards();
    } catch (error) {
      console.error("Could not load collection.", error);
      return;
    }

    cards.sort(
      (a, b) =>
        new Date(b.dateAdded || 0) -
        new Date(a.dateAdded || 0)
    );

    const collectionValue = cards.reduce(
      (sum, card) =>
        sum + (Number(card.value) || 0),
      0
    );

    dom.totalCards.textContent = cards.length;

    dom.collectionCount.textContent =
      cards.length +
      (cards.length === 1 ? " card" : " cards");

    dom.totalValue.textContent =
      formatCurrency(collectionValue);

    dom.collectionList.innerHTML = "";

    dom.emptyCollection.classList.toggle(
      "d-none",
      cards.length > 0
    );

    cards.forEach((card) => {
      const item = document.createElement("article");
      item.className = "vault-item";

      const secondary = [
        card.year,
        card.player,
        card.set,
        card.cardNumber ? "#" + card.cardNumber : "",
        card.parallel
      ]
        .filter(Boolean)
        .join(" • ");

      const valuationDate =
        card.valuationDate
          ? new Date(card.valuationDate).toLocaleDateString()
          : "";

      const safeImage = card.image || "";

      item.innerHTML = `
        <img
          class="vault-image"
          src="${safeImage}"
          alt="Card photo"
        >

        <div class="vault-content">

          <h3 class="vault-title">
            ${escapeHtml(card.title)}
          </h3>

          <div class="vault-description">
            ${escapeHtml(secondary)}
          </div>

          <div class="vault-bottom">

            <div class="vault-value">

              <span>
                eBay Market Estimate
              </span>

              <strong>
                ${formatCurrency(card.value)}
              </strong>

              <span class="vault-date">
                ${valuationDate ? "Valued " + valuationDate : ""}
              </span>

            </div>

            <button
              class="vault-delete"
              type="button"
              data-card-id="${card.id}">
              Delete
            </button>

          </div>

        </div>
      `;

      dom.collectionList.appendChild(item);
    });

    dom.collectionList
      .querySelectorAll(".vault-delete")
      .forEach((button) => {
        button.addEventListener("click", async function () {
          const id = Number(this.dataset.cardId);

          if (!Number.isFinite(id)) return;

          const confirmed = window.confirm(
            "Remove this card from your vault?"
          );

          if (!confirmed) return;

          try {
            await deleteCard(id);
            await renderCollection();
          } catch (error) {
            console.error(error);
            alert("Card Vault could not delete that card.");
          }
        });
      });
  }

  // ============================================================
  // UTILITIES
  // ============================================================

  function formatCurrency(value) {
    const number = Number(value);

    if (!Number.isFinite(number)) return "—";

    return new Intl.NumberFormat(
      "en-US",
      {
        style: "currency",
        currency: "USD"
      }
    ).format(number);
  }

  function escapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = String(value || "");
    return div.innerHTML;
  }

  function resetCapture(restartCamera = false) {
    stopCamera();

    capturedDataUrl = "";
    ebayMatches = [];
    currentMatchIndex = 0;
    selectedMatch = null;

    marketData = {
      estimate: 0,
      count: 0,
      low: 0,
      high: 0
    };

    dom.capturedImage.src = "";
    dom.capturedImage.classList.add("d-none");

    dom.cameraPreview.style.display = "none";
    dom.cameraPlaceholder.classList.remove("d-none");

    dom.captureBtn.classList.add("d-none");
    dom.retakeBtn.classList.add("d-none");
    dom.startCameraBtn.classList.remove("d-none");

    dom.mobileCaptureInput.value = "";

    if (restartCamera) {
      startCamera();
    }
  }

  function refreshScanner() {
    resetCapture(false);
    showScreen("scannerScreen");
  }

  // ============================================================
  // EVENTS
  // ============================================================

  dom.startCameraBtn.addEventListener(
    "click",
    startCamera
  );

  dom.captureBtn.addEventListener(
    "click",
    capturePhoto
  );

  dom.retakeBtn.addEventListener(
    "click",
    () => resetCapture(true)
  );

  dom.mobileCaptureInput.addEventListener(
    "change",
    handleMobileFileCapture
  );

  dom.lookupRetryBtn.addEventListener(
    "click",
    beginIdentification
  );

  dom.confirmMatchBtn.addEventListener(
    "click",
    acceptCurrentMatch
  );

  dom.nextMatchBtn.addEventListener(
    "click",
    showNextMatch
  );

  dom.scanAgainBtn.addEventListener(
    "click",
    refreshScanner
  );

  dom.backToMatchesBtn.addEventListener(
    "click",
    () => showScreen("matchScreen")
  );

  dom.cardDetailsForm.addEventListener(
    "submit",
    handleCardSubmit
  );

  dom.scanNavBtn.addEventListener(
    "click",
    refreshScanner
  );

  dom.collectionNavBtn.addEventListener(
    "click",
    async () => {
      await renderCollection();
      showScreen("collectionScreen");
    }
  );

  dom.bottomRefreshBtn.addEventListener(
    "click",
    refreshScanner
  );

  dom.headerRefreshBtn.addEventListener(
    "click",
    refreshScanner
  );

  if (dom.emptyScanBtn) {
    dom.emptyScanBtn.addEventListener(
      "click",
      refreshScanner
    );
  }

  window.addEventListener(
    "beforeunload",
    stopCamera
  );

  // ============================================================
  // START
  // ============================================================

  renderCollection();

})();
