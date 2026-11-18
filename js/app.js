(function () {
  "use strict";

  var maps = window.PIT_MAPS;
  var order = window.PIT_MAP_ORDER;
  var types = window.PIN_TYPES;
  var typeById = {};
  types.forEach(function (t) { typeById[t.id] = t; });

  var PARKING_TYPES = { "vehicle-parking": true, "equipment-parking": true };

  var state = {
    mapId: order[0],
    pins: {},
    filters: {},
    showLabels: true,
    selectedId: null,
    viewer: null,
    overlays: {},
    areaSvg: null
  };
  types.forEach(function (t) { state.filters[t.id] = true; });

  function clonePin(p) {
    var out = {
      id: p.id,
      type: p.type === "bathroom" ? "porta" : (p.type || "other"),
      name: p.name || "",
      note: p.note || "",
      x: p.x,
      y: p.y,
      source: p.source || "auto"
    };
    if (p.polygon && p.polygon.length) {
      out.polygon = p.polygon.map(function (pt) { return { x: pt.x, y: pt.y }; });
    }
    return out;
  }

  function initPins() {
    order.forEach(function (id) {
      state.pins[id] = (window.DEFAULT_PINS[id] || []).map(clonePin);
    });
  }

  function currentPins() {
    return state.pins[state.mapId] || [];
  }

  function mapInfo() {
    return maps[state.mapId];
  }

  function isParking(type) {
    return !!PARKING_TYPES[type];
  }

  function tileSourceFor(m) {
    return {
      Image: {
        xmlns: "http://schemas.microsoft.com/deepzoom/2008",
        Url: m.tileUrl,
        Format: m.format,
        Overlap: String(m.overlap),
        TileSize: String(m.tileSize),
        Size: { Width: String(m.width), Height: String(m.height) }
      }
    };
  }

  function applyLabelVisibility() {
    document.body.classList.toggle("labels-hidden", !state.showLabels);
  }

  function buildSwitch() {
    var nav = document.getElementById("mapSwitch");
    nav.innerHTML = "";
    order.forEach(function (id) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = maps[id].title;
      b.dataset.map = id;
      if (id === state.mapId) b.className = "active";
      b.addEventListener("click", function () { switchMap(id); });
      nav.appendChild(b);
    });
  }

  function buildLegend() {
    var el = document.getElementById("legend");
    el.innerHTML = "";
    types.forEach(function (t) {
      var row = document.createElement("label");
      row.className = "legend-item" + (state.filters[t.id] ? "" : " off");
      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = !!state.filters[t.id];
      cb.addEventListener("change", function () {
        state.filters[t.id] = cb.checked;
        row.classList.toggle("off", !cb.checked);
        applyFilters();
        renderPinList();
      });
      var sw = document.createElement("span");
      sw.className = "swatch";
      sw.style.background = t.color;
      var name = document.createElement("span");
      name.textContent = t.label;
      var count = document.createElement("span");
      count.className = "count";
      count.dataset.type = t.id;
      row.appendChild(cb);
      row.appendChild(sw);
      row.appendChild(name);
      row.appendChild(count);
      el.appendChild(row);
    });
    var lab = document.createElement("label");
    lab.className = "legend-item toggle";
    var lcb = document.createElement("input");
    lcb.type = "checkbox";
    lcb.id = "toggleLabels";
    lcb.checked = state.showLabels;
    lcb.addEventListener("change", function () {
      state.showLabels = lcb.checked;
      applyLabelVisibility();
    });
    var lname = document.createElement("span");
    lname.textContent = "Show labels";
    lab.appendChild(lcb);
    lab.appendChild(lname);
    el.appendChild(lab);
    updateCounts();
  }

  function updateCounts() {
    var pins = currentPins();
    types.forEach(function (t) {
      var n = pins.filter(function (p) { return p.type === t.id; }).length;
      var el = document.querySelector('.count[data-type="' + t.id + '"]');
      if (el) el.textContent = String(n);
    });
  }

  function renderPinList() {
    var list = document.getElementById("pinList");
    list.innerHTML = "";
    var pins = currentPins().slice().sort(function (a, b) {
      if (a.type !== b.type) return a.type.localeCompare(b.type);
      return (a.name || "").localeCompare(b.name || "");
    });
    pins.forEach(function (p) {
      if (!state.filters[p.type]) return;
      var row = document.createElement("div");
      row.className = "pin-row" + (p.id === state.selectedId ? " selected" : "");
      var dot = document.createElement("span");
      dot.className = "dot";
      dot.style.background = (typeById[p.type] || typeById.other).color;
      var name = document.createElement("span");
      name.className = "name";
      name.textContent = p.name || (typeById[p.type] || typeById.other).label;
      row.appendChild(dot);
      row.appendChild(name);
      row.addEventListener("click", function () { selectPin(p.id, true); });
      list.appendChild(row);
    });
    updateCounts();
  }

  function pinIconSvg(type) {
    if (type === "machine") {
      return '<svg viewBox="0 0 24 24"><path d="M3 18h2l1-3h4l2 3h2l-2.5-4H8.5L7 18H5l1.2-4H3v-2h3.6L8 8h8l2.5 4H21v2h-2.2L20 18h-2l-1-3h-3.2L16 18h-2l-2-3H8.5L7 18H5"/></svg>';
    }
    if (type === "porta") {
      return '<svg viewBox="0 0 24 24"><path d="M7 3h10a2 2 0 0 1 2 2v15H5V5a2 2 0 0 1 2-2zm1 2v13h8V5H8zm3 2h2v2h-2V7zm-1 4h4v1H10v-1z"/></svg>';
    }
    if (type === "entrance") {
      return '<svg viewBox="0 0 24 24"><path d="M4 4h10v16H4V4zm2 2v12h6V6H6zm10 3 5 4-5 4v-3h-3v-2h3V9z"/></svg>';
    }
    if (type === "vehicle-parking") {
      return '<svg viewBox="0 0 24 24"><path d="M5 11l2-5h10l2 5v7h-2.2a1.8 1.8 0 0 1-3.6 0H10.8a1.8 1.8 0 0 1-3.6 0H5v-7zm2.4-1h9.2l-1.1-3H8.5L7.4 10z"/></svg>';
    }
    if (type === "equipment-parking") {
      return '<svg viewBox="0 0 24 24"><path d="M3 17h2l1-3h5l2 3h2v-2h3.5L21 9h-4V6H9L6 9H3v8zm4-6 2-2h6v2H9l-2 2H7v-2z"/></svg>';
    }
    return '<svg viewBox="0 0 24 24"><path d="M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z"/></svg>';
  }

  function pinClass(pin) {
    var cls = "map-pin " + (pin.type || "other");
    if (isParking(pin.type)) cls += " parking";
    if (!state.filters[pin.type]) cls += " hidden";
    if (pin.id === state.selectedId) cls += " selected";
    return cls;
  }

  function makePinElement(pin) {
    var el = document.createElement("div");
    el.className = pinClass(pin);
    el.dataset.id = pin.id;
    el.style.cursor = "pointer";
    el.innerHTML = '<div class="icon">' + pinIconSvg(pin.type) + '</div><div class="label"></div>';
    el.querySelector(".label").textContent = pin.name || (typeById[pin.type] || typeById.other).label;
    return el;
  }

  function imagePoint(pin) {
    return normToViewport(pin.x, pin.y);
  }

  function normToViewport(nx, ny) {
    var m = mapInfo();
    return state.viewer.viewport.imageToViewportCoordinates(nx * m.width, ny * m.height);
  }

  function imageRectViewport() {
    var m = mapInfo();
    return state.viewer.viewport.imageToViewportRectangle(new OpenSeadragon.Rect(0, 0, m.width, m.height));
  }

  function pinPlacement(pin) {
    return isParking(pin.type) ? OpenSeadragon.Placement.CENTER : OpenSeadragon.Placement.BOTTOM;
  }

  function clearAreaLayer() {
    if (state.areaSvg && state.viewer) {
      try { state.viewer.removeOverlay(state.areaSvg); } catch (e) {}
    }
    state.areaSvg = null;
  }

  function ensureAreaLayer() {
    if (state.areaSvg && state.areaSvg.parentNode) return state.areaSvg;
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "area-layer");
    svg.setAttribute("viewBox", "0 0 1 1");
    svg.setAttribute("preserveAspectRatio", "none");
    svg.style.width = "100%";
    svg.style.height = "100%";
    svg.style.overflow = "visible";
    svg.style.pointerEvents = "none";
    state.viewer.addOverlay({
      element: svg,
      location: imageRectViewport(),
      placement: OpenSeadragon.Placement.TOP_LEFT,
      checkResize: false
    });
    state.areaSvg = svg;
    return svg;
  }

  function hexToRgba(hex, a) {
    var h = (hex || "#888888").replace("#", "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    return "rgba(" + r + "," + g + "," + b + "," + a + ")";
  }

  function renderAreas() {
    if (!state.viewer) return;
    var svg = ensureAreaLayer();
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    currentPins().forEach(function (p) {
      if (!p.polygon || p.polygon.length < 3) return;
      var poly = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
      var pts = p.polygon.map(function (pt) { return pt.x + "," + pt.y; }).join(" ");
      var color = (typeById[p.type] || typeById.other).color;
      poly.setAttribute("points", pts);
      poly.setAttribute("class", "area-poly" + (p.id === state.selectedId ? " selected" : "") + (!state.filters[p.type] ? " hidden" : ""));
      poly.setAttribute("fill", hexToRgba(color, 0.28));
      poly.setAttribute("stroke", color);
      poly.style.pointerEvents = "auto";
      poly.style.cursor = "pointer";
      poly.dataset.id = p.id;
      poly.addEventListener("click", function (ev) {
        ev.stopPropagation();
        ev.preventDefault();
        selectPin(p.id, false);
      });
      svg.appendChild(poly);
    });
  }

  function clearOverlays() {
    if (!state.viewer) return;
    Object.keys(state.overlays).forEach(function (id) {
      var rec = state.overlays[id];
      try { state.viewer.removeOverlay(rec.element); } catch (e) {}
    });
    state.overlays = {};
    clearAreaLayer();
  }

  function placeOverlay(pin) {
    if (!state.viewer) return;
    var el = makePinElement(pin);
    state.viewer.addOverlay({
      element: el,
      location: imagePoint(pin),
      placement: pinPlacement(pin),
      checkResize: false
    });
    new OpenSeadragon.MouseTracker({
      element: el,
      clickHandler: function (e) {
        OpenSeadragon.cancelEvent(e.originalEvent);
        selectPin(pin.id, false);
      }
    });
    state.overlays[pin.id] = { element: el, pin: pin };
  }

  function refreshOverlays() {
    clearOverlays();
    if (!state.viewer) return;
    ensureAreaLayer();
    renderAreas();
    currentPins().forEach(placeOverlay);
    updateLabelScale();
  }

  function applyFilters() {
    currentPins().forEach(function (p) {
      var rec = state.overlays[p.id];
      if (rec) rec.element.classList.toggle("hidden", !state.filters[p.type]);
    });
    renderAreas();
  }

  function selectPin(id, flyTo) {
    state.selectedId = id;
    var pin = currentPins().filter(function (p) { return p.id === id; })[0];
    Object.keys(state.overlays).forEach(function (k) {
      state.overlays[k].element.classList.toggle("selected", k === id);
    });
    renderPinList();
    renderAreas();
    if (!pin) return;
    if (flyTo && state.viewer) flyToPin(pin);
  }

  function flyToPin(pin) {
    var m = mapInfo();
    var vp = state.viewer.viewport;
    if (pin.polygon && pin.polygon.length >= 3) {
      var minx = 1, miny = 1, maxx = 0, maxy = 0, i, pt;
      for (i = 0; i < pin.polygon.length; i++) {
        pt = pin.polygon[i];
        if (pt.x < minx) minx = pt.x;
        if (pt.y < miny) miny = pt.y;
        if (pt.x > maxx) maxx = pt.x;
        if (pt.y > maxy) maxy = pt.y;
      }
      var padX = Math.max((maxx - minx) * 0.8, 120 / m.width);
      var padY = Math.max((maxy - miny) * 0.8, 120 / m.height);
      var rect = vp.imageToViewportRectangle(new OpenSeadragon.Rect(
        (minx - padX) * m.width,
        (miny - padY) * m.height,
        (maxx - minx + 2 * padX) * m.width,
        (maxy - miny + 2 * padY) * m.height
      ));
      vp.fitBoundsWithConstraints(rect, false);
      return;
    }
    var loc = vp.imageToViewportCoordinates(pin.x * m.width, pin.y * m.height);
    vp.panTo(loc, false);
    var target = Math.min(vp.getMaxZoom() * 0.2, vp.getHomeZoom() * 8);
    if (vp.getZoom() < target) vp.zoomTo(target, loc, false);
  }

  function updateLabelScale() {
    if (!state.viewer || !state.viewer.viewport) return;
    var z = state.viewer.viewport.getZoom(true);
    var home = state.viewer.viewport.getHomeZoom();
    var ratio = z / Math.max(home, 0.0001);
    var s;
    if (ratio <= 1) s = 0.92;
    else if (ratio < 8) s = 0.92 + (Math.min(ratio, 8) - 1) / 7 * 0.22;
    else s = 1.12;
    document.documentElement.style.setProperty("--label-scale", String(s));
  }

  function createViewer() {
    if (state.viewer) {
      try { state.viewer.destroy(); } catch (e) {}
      state.viewer = null;
      state.overlays = {};
      state.areaSvg = null;
    }
    var m = mapInfo();
    state.viewer = OpenSeadragon({
      id: "viewer",
      prefixUrl: "vendor/openseadragon/images/",
      tileSources: tileSourceFor(m),
      animationTime: 0.7,
      springStiffness: 6.5,
      visibilityRatio: 0.8,
      minZoomImageRatio: 0.6,
      maxZoomPixelRatio: 2.5,
      showNavigator: true,
      navigatorPosition: "BOTTOM_RIGHT",
      navigatorSizeRatio: 0.18,
      navigatorAutoFade: false,
      showZoomControl: true,
      showHomeControl: true,
      showFullPageControl: true,
      showRotationControl: false,
      gestureSettingsMouse: { clickToZoom: false, dblClickToZoom: true },
      crossOriginPolicy: false,
      ajaxWithCredentials: false,
      loadTilesWithAjax: false
    });

    state.viewer.addHandler("open", function () {
      refreshOverlays();
    });
    state.viewer.addHandler("animation", updateLabelScale);
    state.viewer.addHandler("animation-finish", updateLabelScale);
    state.viewer.addHandler("resize", updateLabelScale);
  }

  function switchMap(id) {
    if (id === state.mapId && state.viewer) return;
    state.mapId = id;
    state.selectedId = null;
    buildSwitch();
    renderPinList();
    createViewer();
  }

  function bindChrome() {
    document.getElementById("btnHome").addEventListener("click", function () {
      if (state.viewer) state.viewer.viewport.goHome();
    });
    document.getElementById("btnFull").addEventListener("click", function () {
      if (state.viewer) state.viewer.setFullPage(!state.viewer.isFullPage());
    });
  }

  applyLabelVisibility();
  initPins();
  bindChrome();
  buildSwitch();
  buildLegend();
  renderPinList();
  createViewer();
})();
