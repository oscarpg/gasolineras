/*
 * LEGACY UI CODE (temporary).
 *
 * What is left of the original inline <script>: the DOM and Leaflet rendering.
 * Since Phase 4 it holds no state of its own:
 *   - all state lives in the store (src/state/), created in main.ts;
 *   - user events call pure transitions (src/state/transitions.ts);
 *   - rendering reads the store; which stations to show comes from
 *     domain/filters.ts via a memoised selector;
 *   - async work (provinces, price history) goes through src/state/effects.ts;
 *   - preferences are saved by src/state/persistence.ts, not here.
 *
 * Phase 5 splits this file into src/ui/ components (with escaping, event
 * delegation and i18n) and deletes it. Until then it is not linted or
 * formatted (see eslint.config.js / .prettierignore), and Leaflet is still the
 * global `L` from the CDN <script> in index.html.
 */
import { FUELS } from '../config/fuels';
import { KNOWN_BRANDS } from '../config/brands';
import { normalizeBrand } from '../domain/brands';
import { toMitecoDate } from '../domain/dates';
import { significantPricePoints } from '../domain/priceHistory';
import { countBrands, createVisibleStationsSelector, selectActiveCar, selectIsCheckingHistory } from '../state/selectors';
import {
  deleteCar,
  removeDiscount,
  resetHistoryDepth,
  saveCar,
  selectCar,
  setAllBrands,
  setBrandSelected,
  setCustomAgeDays,
  setDiscount,
  setFuel,
  setPreferences,
  setRoute,
  setUserPosition
} from '../state/transitions';

/**
 * @param {object} ctx
 * @param {import('../state/store').Store<import('../state/appState').AppState>} ctx.store
 * @param {import('../state/effects').Effects} ctx.effects
 * @param {import('../services/miteco').MitecoService} ctx.miteco
 * @param {import('../services/geocoding').Geocoder} ctx.geocoder
 * @param {import('../services/routing').Router} ctx.router
 * @param {import('../platform/geolocation').GeoProvider} ctx.gps
 */
export function startLegacyApp({ store, effects, miteco, geocoder, router, gps }) {
  const seleccionarVisibles = createVisibleStationsSelector();
  const $ = id => document.getElementById(id);

  /* ============ Iconos del mapa ============ */
  const iconoUsuario = L.divIcon({
    className: "marcador-usuario",
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -10]
  });

  function crearIconoGasolinera(color) {
    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="26" height="38" viewBox="0 0 26 38">
      <path d="M13 1C6.37 1 1 6.37 1 13c0 8.8 12 23.5 12 23.5S25 21.8 25 13c0-6.63-5.37-12-12-12z"
            fill="${color}" stroke="#ffffff" stroke-width="2"/>
      <circle cx="13" cy="13" r="4.5" fill="#ffffff"/>
    </svg>`;
    return L.divIcon({
      className: "icono-gasolinera",
      html: svg,
      iconSize: [26, 38],
      iconAnchor: [13, 37],
      popupAnchor: [0, -34]
    });
  }

  /* ============ Drawer y panel flotante ============ */
  const drawerPrefs = $("drawerPrefs");
  const backdropPrefs = $("backdropPrefs");

  function abrirPreferencias() {
    drawerPrefs.classList.add("abierto");
    backdropPrefs.classList.add("activo");
  }
  function cerrarPreferencias() {
    drawerPrefs.classList.remove("abierto");
    backdropPrefs.classList.remove("activo");
  }

  $("btnAbrirPrefs").onclick = abrirPreferencias;
  $("btnCerrarPrefs").onclick = cerrarPreferencias;
  backdropPrefs.onclick = cerrarPreferencias;

  $("toggleBaratas").onclick = () => {
    const minimizado = $("panelBaratas").classList.toggle("minimizado");
    $("iconoToggleBaratas").textContent = minimizado ? "▲" : "▼";
  };

  /* ============ Mapa ============ */
  let marcadorUsuario = null;
  const mapa = L.map("mapa").setView([40.4168, -3.7038], 6);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a> · Precios: MITECO"
  }).addTo(mapa);
  const capaEstaciones = L.layerGroup().addTo(mapa);
  const capaRuta = L.layerGroup().addTo(mapa);

  /* ============ Controles ============ */
  const selCarb = $("carburante");
  const selCocheFuel = $("cocheFuel");
  const selAntiguedad = $("antiguedad");
  const inpDias = $("diasAntiguedadVal");
  const inpRadioUbicacion = $("radioUbicacion");
  const inpRadioRuta = $("radio");
  const chkSoloRuta = $("soloRuta");
  const chkOrdenCoste = $("chkOrdenCosteReal");

  for (const [k, f] of Object.entries(FUELS)) {
    const o1 = document.createElement("option");
    o1.value = k; o1.textContent = f.label;
    selCarb.appendChild(o1);

    const o2 = document.createElement("option");
    o2.value = k; o2.textContent = f.label;
    selCocheFuel.appendChild(o2);
  }

  /** Copia el estado a los controles. No toca un campo de texto mientras el usuario escribe en él. */
  function sincronizarControles(s) {
    const p = s.preferences;
    const fijar = (el, prop, valor) => {
      if (el[prop] === valor) return;
      if (prop === "value" && el === document.activeElement && el.type !== "range" && el.tagName !== "SELECT") return;
      el[prop] = valor;
    };
    fijar(selCarb, "value", p.fuel);
    fijar(selAntiguedad, "value", p.ageFilterPreset);
    fijar(inpDias, "value", String(p.ageFilterCustomDays));
    fijar(inpRadioUbicacion, "value", String(p.searchRadiusKm));
    fijar(inpRadioRuta, "value", String(p.routeDetourKm));
    fijar(chkSoloRuta, "checked", p.routeOnly);
    fijar(chkOrdenCoste, "checked", p.sortByTotalCost);
    $("radioUbicacionVal").textContent = p.searchRadiusKm;
    $("radioVal").textContent = p.routeDetourKm;
    $("filaDiasCustom").hidden = !(p.ageFilterPreset === "MAX_X" || p.ageFilterPreset === "MAS_X");
  }

  /* ============ Coches ============ */
  function renderCoches(s) {
    const coche = selectActiveCar(s);
    const cont = $("contenedorChkCoste");
    const lbl = $("lblOrdenCosteReal");
    if (!coche) {
      chkOrdenCoste.disabled = true;
      cont.classList.add("deshabilitado");
      lbl.textContent = "Selecciona un coche para ordenar por coste total (depósito + viaje)";
    } else {
      chkOrdenCoste.disabled = false;
      cont.classList.remove("deshabilitado");
      lbl.textContent = `Ordenar por coste total con ${coche.name} (depósito + ida y vuelta)`;
    }

    const lista = $("listaCoches");
    lista.innerHTML = "";
    const { cars, activeCarId } = s.preferences;
    if (cars.length === 0) {
      lista.innerHTML = `<small class="u-text-muted">No hay coches configurados.</small>`;
      return;
    }

    for (const c of cars) {
      const esActivo = c.id === activeCarId;
      const div = document.createElement("div");
      div.className = `coche-item ${esActivo ? "activo" : ""}`;
      div.innerHTML = `
      <div class="coche-info">
        <div><b>${c.name}</b> ${esActivo ? `<span class="badge-desc">Activo</span>` : ""}</div>
        <div class="coche-meta">
          ${FUELS[c.fuel]?.label} · Depósito: ${c.tankLitres} L · ${c.consumptionL100km} l/100km
        </div>
      </div>
      <div class="coche-acciones">
        ${!esActivo ? `<button class="sec btn-mini btn-usar">Usar</button>` : ""}
        <button class="btn-del" title="Eliminar coche">✕</button>
      </div>
    `;
      const btnUsar = div.querySelector(".btn-usar");
      if (btnUsar) btnUsar.onclick = () => store.update(st => selectCar(st, c.id));
      div.querySelector(".btn-del").onclick = () => store.update(st => deleteCar(st, c.id));
      lista.appendChild(div);
    }
  }

  $("btnGuardarCoche").onclick = () => {
    const name = $("cocheNombre").value.trim();
    const fuel = selCocheFuel.value;
    const tankLitres = parseFloat($("cocheDeposito").value);
    const consumptionL100km = parseFloat($("cocheConsumo").value);

    if (!name || !Number.isFinite(tankLitres) || tankLitres <= 0 || !Number.isFinite(consumptionL100km) || consumptionL100km <= 0) {
      alert("Completa el nombre, tamaño de depósito (L) y consumo (l/100km).");
      return;
    }

    $("cocheNombre").value = "";
    $("cocheDeposito").value = "";
    $("cocheConsumo").value = "";
    store.update(s => saveCar(s, { name, fuel, tankLitres, consumptionL100km }, "car_" + Date.now()));
  };

  chkOrdenCoste.onchange = () => store.update(s => setPreferences(s, { sortByTotalCost: chkOrdenCoste.checked }));

  /* ============ Descuentos ============ */
  function etiquetaDescuento(d) {
    if (!d || !d.value) return "";
    return d.type === "PCT" ? `-${d.value}%` : `-${d.value} cts/l`;
  }

  function renderDescuentos(s) {
    const sel = $("descMarca");
    const valorActual = sel.value;

    const todasMarcas = new Set([...KNOWN_BRANDS.map(b => normalizeBrand(b)), ...s.stations.map(e => e.brand)]);
    const ordenadas = [...todasMarcas].sort((a, b) => a.localeCompare(b, "es"));

    sel.innerHTML = `<option value="">Selecciona una marca…</option>`;
    for (const m of ordenadas) {
      const opt = document.createElement("option");
      opt.value = m;
      opt.textContent = m;
      sel.appendChild(opt);
    }
    if (todasMarcas.has(valorActual)) sel.value = valorActual;

    const cont = $("listaDescuentos");
    cont.innerHTML = "";
    const entradas = Object.entries(s.preferences.discounts);
    if (entradas.length === 0) {
      cont.innerHTML = `<small class="u-text-muted">Sin descuentos configurados.</small>`;
      return;
    }

    for (const [marca, d] of entradas) {
      const div = document.createElement("div");
      div.className = "desc-item";
      div.innerHTML = `
      <span><b>${marca}</b>: ${etiquetaDescuento(d)}</span>
      <button class="btn-del" title="Eliminar descuento">✕</button>
    `;
      div.querySelector("button").onclick = () => store.update(st => removeDiscount(st, marca));
      cont.appendChild(div);
    }
  }

  $("btnAddDesc").onclick = () => {
    const marca = $("descMarca").value;
    const value = parseFloat($("descValor").value);
    const type = $("descTipo").value;
    if (!marca || !Number.isFinite(value) || value <= 0) return;
    $("descValor").value = "";
    store.update(s => setDiscount(s, marca, { type, value }));
  };

  /* ============ Filtro de marcas ============ */
  function renderMarcas(s) {
    const cont = $("marcas");
    cont.innerHTML = "";

    const conteo = countBrands(s.stations);
    const marcas = conteo.map(([m]) => m);
    const seleccion = new Set(s.preferences.brands);

    if (marcas.length === 0) {
      cont.innerHTML = `<em class="u-text-sm">Sin gasolineras</em>`;
      return;
    }
    const todas = document.createElement("label");
    todas.innerHTML = `<input type="checkbox" id="chkTodas" ${seleccion.size === 0 ? "checked" : ""}> Todas (${marcas.length})`;
    cont.appendChild(todas);
    todas.querySelector("input").onchange = e => store.update(st => setAllBrands(st, e.target.checked, marcas));
    for (const [m, n] of conteo) {
      const lb = document.createElement("label");
      lb.innerHTML = `<input type="checkbox" ${seleccion.has(m) ? "checked" : ""}> ${m} (${n})`;
      lb.querySelector("input").onchange = ev => store.update(st => setBrandSelected(st, m, ev.target.checked));
      cont.appendChild(lb);
    }
  }

  /* ============ Estado del histórico ============ */
  function renderInfoHistorico(s) {
    const h = s.historyStatus;
    if (!h) return;
    $("infoEstadoAntiguedad").textContent =
      h.status === "loading" ? `⏳ Comprobando histórico de precios (${h.days} días)…`
      : h.status === "done" ? `✅ Histórico comprobado (${h.days} días hacia atrás).`
      : `⚠️ No se pudo comprobar todo el histórico.`;
  }

  function textoAntiguedad(estacion, info) {
    if (!info) {
      return estacion.bulletinDate ? `📅 Boletín MITECO: ${estacion.bulletinDate} (comprobando histórico…)` : "📅 Comprobando histórico…";
    }
    const tope = info.windowDays - 1 || 3;
    if (info.days === 0) return `🟢 Actualizado hoy (${info.since})`;
    if (info.days === 1) return `🕒 1 día sin actualizar (desde ${info.since})`;
    if (info.days <= tope) return `🕒 ${info.days} días sin actualizar (desde ${info.since})`;
    return `⚠️ +${tope} días sin actualizar (≤ ${info.since})`;
  }

  /* ============ Mapa, lista y línea de estado ============ */
  function etiquetaResumenAntiguedad(filtro, diasX) {
    if (filtro === "TODAS") return "";
    if (filtro === "0") return " · act. hoy";
    if (filtro === "1") return " · ≤ 1d sin act.";
    if (filtro === "2") return " · ≤ 2d sin act.";
    if (filtro === "3") return " · ≤ 3d sin act.";
    if (filtro === "MAX_X") return ` · ≤ ${diasX}d sin act.`;
    if (filtro === "EXACTO_1") return " · 1d sin act.";
    if (filtro === "EXACTO_2") return " · 2d sin act.";
    if (filtro === "MAS_3") return " · > 3d sin act.";
    if (filtro === "MAS_X") return ` · > ${diasX}d sin act.`;
    return "";
  }

  function pintar(s) {
    const p = s.preferences;
    const fuel = p.fuel;
    const coche = selectActiveCar(s);
    const ruta = s.route;
    const { rows, sortedByTotalCost: ordenarPorCosteReal } = seleccionarVisibles(s);

    capaEstaciones.clearLayers();
    const marcadoresPorId = new Map();

    for (const r of rows) {
      const e = r.station;
      const tieneDesc = r.finalPrice < r.basePrice;
      const c = r.cost;

      const distTexto = ruta
        ? `<br><small>🛣️ Desvío de ruta: ${r.routeDetourKm.toFixed(1)} km (${c.roundTripKm.toFixed(1)} km i/v)</small>`
        : (r.distanceFromUserKm !== null ? `<br><small>📍 A ${r.distanceFromUserKm.toFixed(1)} km (${c.roundTripKm.toFixed(1)} km i/v)</small>` : "");

      let infoCochePopup = "";
      if (coche && c.totalCost != null) {
        infoCochePopup =
          `<br><small class="popup-coche">` +
          `🚗 <b>${coche.name}</b> (${coche.tankLitres}L):<br>` +
          `• Depósito: ${c.tankCost.toFixed(2)} €<br>` +
          `• Desplazamiento i/v (${c.roundTripKm.toFixed(1)} km · ${c.tripLitres.toFixed(2)}L): +${c.tripCost.toFixed(2)} €<br>` +
          `• <b>Total real: ${c.totalCost.toFixed(2)} €</b>` +
          `</small>`;
      }

      const btnHist = e.code
        ? `<br><button class="sec btn-historial" onclick="verEvolucion('${e.code}', '${e.provinceCode}', '${e.id}')">📈 Ver evolución (7 días)</button><div id="grafica-${e.code}"></div>`
        : "";

      const htmlPrecioPopup = tieneDesc
        ? `<span class="precio" style="color:${r.color}">${FUELS[fuel].label}: ${r.finalPrice.toFixed(3)} €/l</span>` +
          `<span class="precio-tachado">${r.basePrice.toFixed(3)} €/l</span>` +
          `<span class="badge-desc">${etiquetaDescuento(r.discount)}</span>`
        : `<span class="precio" style="color:${r.color}">${FUELS[fuel].label}: ${r.finalPrice.toFixed(3)} €/l</span>`;

      const marker = L.marker([e.lat, e.lon], { icon: crearIconoGasolinera(r.color) }).bindPopup(
        `<b>${e.name}</b><br><small>${e.address}</small><br>` +
        htmlPrecioPopup +
        infoCochePopup +
        `<br><small>${textoAntiguedad(e, r.staleness)}</small>` +
        distTexto +
        (e.openingHours ? `<br><small>${e.openingHours}</small>` : "") +
        btnHist
      ).addTo(capaEstaciones);

      marcadoresPorId.set(e.id, marker);
    }

    const contLista = $("listaBaratas");
    contLista.innerHTML = "";

    if (rows.length === 0) {
      contLista.innerHTML = `<em class="u-text-sm u-text-muted">Ninguna gasolinera cumple el filtro.</em>`;
    } else {
      for (const [idx, r] of rows.slice(0, 20).entries()) {
        const e = r.station;
        const c = r.cost;
        const tieneDesc = r.finalPrice < r.basePrice;
        const color = r.color;

        const card = document.createElement("div");
        card.className = "item-gasolinera";

        const textoDistancia = ruta
          ? `🛣️ Desvío ${r.routeDetourKm.toFixed(1)} km · `
          : (r.distanceFromUserKm !== null ? `📍 ${r.distanceFromUserKm.toFixed(1)} km · ` : "");

        let lineaCoche = "";
        let bloqueDerecho = `
        <div class="importe" style="color:${color}">${r.finalPrice.toFixed(3)} €/l</div>
        ${tieneDesc ? `<div class="precio-tachado u-ml-0">${r.basePrice.toFixed(3)} €/l</div>` : ""}
      `;

        if (coche && c.totalCost != null) {
          lineaCoche = `
          <div class="meta-coche">
            🚗 Depósito: ${c.tankCost.toFixed(2)} € + Viaje i/v: ${c.tripCost.toFixed(2)} € = <b>${c.totalCost.toFixed(2)} €</b>
          </div>
        `;
          if (ordenarPorCosteReal) {
            bloqueDerecho = `
            <div class="importe" style="color:${color}">${c.totalCost.toFixed(2)} €</div>
            <div class="sub-importe">${r.finalPrice.toFixed(3)} €/l</div>
            ${tieneDesc ? `<div class="precio-tachado u-ml-0">${r.basePrice.toFixed(3)} €/l</div>` : ""}
          `;
          } else {
            bloqueDerecho = `
            <div class="importe" style="color:${color}">${r.finalPrice.toFixed(3)} €/l</div>
            ${tieneDesc ? `<div class="precio-tachado u-ml-0">${r.basePrice.toFixed(3)} €/l</div>` : ""}
            <div class="sub-importe">Total: ${c.totalCost.toFixed(2)} €</div>
          `;
          }
        }

        card.innerHTML = `
        <div class="info">
          <div class="nombre">
            ${idx + 1}. ${e.name}
            ${tieneDesc ? `<span class="badge-desc">${etiquetaDescuento(r.discount)}</span>` : ""}
          </div>
          <div class="meta">${textoDistancia}${e.address}</div>
          ${lineaCoche}
          <div class="meta">${textoAntiguedad(e, r.staleness)}</div>
        </div>
        <div class="item-precios">
          ${bloqueDerecho}
        </div>
      `;

        card.onclick = () => {
          mapa.setView([e.lat, e.lon], 15);
          const m = marcadoresPorId.get(e.id);
          if (m) m.openPopup();
        };
        contLista.appendChild(card);
      }
    }

    estado(
      `${rows.length} gasolineras · ${FUELS[fuel].label}` +
      (coche ? ` · ${coche.name}` : "") +
      etiquetaResumenAntiguedad(p.ageFilterPreset, p.ageFilterCustomDays) +
      (selectIsCheckingHistory(s) ? " · ⏳ comprobando histórico…" : "") +
      (ordenarPorCosteReal ? " · orden: coste total" : " · orden: €/l") +
      (ruta ? " · en ruta" : ` · máx. ${p.searchRadiusKm} km`)
    );
  }

  /* ============ Render a partir del store ============ */
  // Cada parte se redibuja solo cuando cambian los datos de los que depende.
  const s0 = store.getState();
  let previo = {
    cars: s0.preferences.cars, activeCarId: s0.preferences.activeCarId,
    stations: s0.stations, discounts: s0.preferences.discounts, brands: s0.preferences.brands,
    historyStatus: s0.historyStatus
  };

  function render(s) {
    const p = s.preferences;
    sincronizarControles(s);
    if (p.cars !== previo.cars || p.activeCarId !== previo.activeCarId) renderCoches(s);
    if (s.stations !== previo.stations || p.discounts !== previo.discounts) renderDescuentos(s);
    if (s.stations !== previo.stations || p.brands !== previo.brands) renderMarcas(s);
    if (s.historyStatus !== previo.historyStatus) renderInfoHistorico(s);
    previo = {
      cars: p.cars, activeCarId: p.activeCarId,
      stations: s.stations, discounts: p.discounts, brands: p.brands,
      historyStatus: s.historyStatus
    };
    pintar(s);
  }

  /* ============ Utilidades ============ */
  function estado(msg) { $("estado").textContent = msg; }

  /* ============ Carga de provincias ============ */
  async function cargarProvincia(codProvincia, forzar = false) {
    if (!codProvincia) return;
    if (!forzar && store.getState().loadedProvinces.includes(codProvincia)) return;

    if (forzar || !miteco.hasCachedProvince(codProvincia)) {
      estado(`Descargando datos de la provincia (${codProvincia})…`);
    }
    try {
      await effects.loadProvince(codProvincia, { force: forzar });
    } catch (err) {
      estado("Error cargando provincia: " + err.message);
    }
  }

  /* ============ Origen y ubicación ============ */
  async function fijarOrigenConCoords(lat, lon, zoom = 13, codProvincia = null) {
    if (marcadorUsuario) mapa.removeLayer(marcadorUsuario);
    marcadorUsuario = L.marker([lat, lon], { icon: iconoUsuario, zIndexOffset: 1000 }).addTo(mapa)
      .bindPopup("<b>Tu ubicación / Origen</b>").openPopup();
    mapa.setView([lat, lon], zoom);
    store.update(s => setUserPosition(s, [lat, lon]));

    if (!codProvincia) {
      estado("Determinando provincia…");
      try {
        codProvincia = await geocoder.reverseProvince([lat, lon]);
      } catch (_) {}
    }

    if (codProvincia) {
      await cargarProvincia(codProvincia);
    } else {
      estado("No se pudo determinar la provincia correspondiente.");
    }
    // Como en la versión original: el resumen sustituye a los mensajes temporales.
    render(store.getState());
  }

  function pedirGps() {
    estado("Obteniendo ubicación GPS…");
    gps.getCurrentPosition().then(
      ([lat, lon]) => fijarOrigenConCoords(lat, lon),
      err => estado("Error GPS: " + err.message + ". Usa Preferencias para buscar dirección.")
    );
  }

  $("btnGps").onclick = () => { pedirGps(); cerrarPreferencias(); };
  $("btnGpsRapido").onclick = pedirGps;

  $("btnDir").onclick = async () => {
    const q = $("direccion").value.trim();
    if (!q) return;
    estado("Buscando dirección…");
    try {
      const lugar = await geocoder.search(q);
      if (!lugar) { estado("Dirección no encontrada"); return; }
      await fijarOrigenConCoords(lugar.latLng[0], lugar.latLng[1], 13, lugar.provinceCode);
      cerrarPreferencias();
    } catch (e) { estado("Error: " + e.message); }
  };

  /* ============ Rutas ============ */
  $("btnRuta").onclick = async () => {
    const q = $("destino").value.trim();
    if (!q) return;
    const origen = store.getState().userPosition;
    if (!origen) { estado("Indica primero tu ubicación de origen"); return; }
    estado("Calculando ruta…");
    try {
      const lugar = await geocoder.search(q);
      if (!lugar) { estado("Destino no encontrado"); return; }

      const codDest = lugar.provinceCode;
      if (codDest && !store.getState().loadedProvinces.includes(codDest)) {
        await cargarProvincia(codDest);
      }

      const puntos = await router.route(origen, lugar.latLng);
      if (!puntos) { estado("No se pudo calcular la ruta"); return; }

      capaRuta.clearLayers();
      L.polyline(puntos, { color: "#1565C0", weight: 6 }).addTo(capaRuta);
      mapa.fitBounds(L.latLngBounds(puntos));
      store.update(s => setRoute(s, puntos));
      cerrarPreferencias();
    } catch (e) { estado("Error de ruta: " + e.message); }
  };

  $("btnQuitarRuta").onclick = () => {
    capaRuta.clearLayers();
    store.update(s => setRoute(s, null));
  };

  /* ============ Filtros y preferencias ============ */
  selAntiguedad.onchange = () => {
    store.update(s => setPreferences(s, { ageFilterPreset: selAntiguedad.value }));
    effects.ensureHistoryForFilter();
  };
  inpDias.onchange = () => {
    store.update(s => setCustomAgeDays(s, +inpDias.value));
    effects.ensureHistoryForFilter();
  };
  selCarb.onchange = () => store.update(s => setFuel(s, selCarb.value));
  chkSoloRuta.onchange = () => store.update(s => setPreferences(s, { routeOnly: chkSoloRuta.checked }));
  inpRadioUbicacion.oninput = () => store.update(s => setPreferences(s, { searchRadiusKm: +inpRadioUbicacion.value }));
  inpRadioRuta.oninput = () => store.update(s => setPreferences(s, { routeDetourKm: +inpRadioRuta.value }));

  $("btnActualizar").onclick = async () => {
    store.update(resetHistoryDepth);
    for (const cod of [...store.getState().loadedProvinces]) {
      await cargarProvincia(cod, true);
    }
  };

  /* ============ Gráfica de evolución (7 días) ============ */
  async function verEvolucion(codigo, codProvincia, idEstacion) {
    const cont = $(`grafica-${codigo}`);
    if (!cont) return;
    const fuel = store.getState().preferences.fuel;
    cont.innerHTML = `<small class="u-text-muted">Cargando histórico de 7 días…</small>`;

    try {
      const hoy = new Date();
      const fechas = [];
      for (let i = 6; i >= 1; i--) {
        const d = new Date(hoy);
        d.setDate(hoy.getDate() - i);
        fechas.push({ etiqueta: `${d.getDate()}/${d.getMonth() + 1}`, fechaMiteco: toMitecoDate(d) });
      }

      const resultados = await Promise.all(
        fechas.map(f => miteco.getHistoryDay(codProvincia, f.fechaMiteco).catch(() => null))
      );

      const serie = fechas.map((f, idx) => ({
        idx,
        etiqueta: f.etiqueta,
        precio: resultados[idx]?.[codigo]?.[fuel] ?? null
      }));

      const estHoy = store.getState().stations.find(e => e.id === idEstacion);
      serie.push({ idx: 6, etiqueta: "Hoy", precio: estHoy?.prices?.[fuel] ?? null });

      const puntosReales = significantPricePoints(
        serie.map(s => ({ ...s, label: s.etiqueta, price: s.precio }))
      );

      if (puntosReales.length === 0) {
        cont.innerHTML = `<small class="u-text-danger">Sin datos históricos disponibles.</small>`;
        return;
      }
      cont.innerHTML = generarSvgGrafica(serie, puntosReales);
    } catch (e) {
      cont.innerHTML = `<small class="u-text-danger">Error al cargar histórico.</small>`;
    }
  }

  function generarSvgGrafica(serieCompleta, puntosReales) {
    const w = 240, h = 115, padX = 28, padY = 24;
    const precios = puntosReales.map(p => p.precio);
    let min = Math.min(...precios), max = Math.max(...precios);
    const sinCambios = Math.abs(max - min) < 0.0005;
    if (sinCambios) { min -= 0.02; max += 0.02; }

    const xPos = idx => padX + (idx / (serieCompleta.length - 1)) * (w - padX * 2);
    const yPos = precio => padY + (1 - (precio - min) / (max - min)) * (h - padY * 2);

    const coords = puntosReales.map(p => ({ x: xPos(p.idx), y: yPos(p.precio), ...p }));
    const polilinea = coords.map(c => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");

    return `
    <svg width="${w}" height="${h}" class="grafica-precio">
      ${coords.length > 1
        ? `<polyline fill="none" stroke="#1565C0" stroke-width="2" stroke-dasharray="${sinCambios ? "4,3" : "none"}" points="${polilinea}" />`
        : ""}
      ${coords.map(c => `
        <circle cx="${c.x}" cy="${c.y}" r="3.5" fill="#2E7D32" />
        <text x="${c.x}" y="${c.y - 7}" font-size="9" text-anchor="middle" fill="#222" font-weight="600">${c.precio.toFixed(3)}</text>
      `).join("")}
      ${serieCompleta.map(s => `
        <text x="${xPos(s.idx)}" y="${h - 6}" font-size="8" text-anchor="middle" fill="${s.precio !== null ? "#555" : "#bbb"}">${s.etiqueta}</text>
      `).join("")}
    </svg>
    ${sinCambios ? `<small class="grafica-nota">Sin variaciones de precio en los días consultados.</small>` : ""}
  `;
  }

  // Los popups usan onclick="verEvolucion(...)": puente global hasta la Fase 5 (delegación de eventos).
  window.verEvolucion = verEvolucion;

  /* ============ Inicio ============ */
  sincronizarControles(s0);
  renderCoches(s0);
  renderDescuentos(s0);
  store.subscribe(render);

  if (gps.isAvailable()) {
    estado("Obteniendo tu ubicación…");
    gps.getCurrentPosition().then(
      ([lat, lon]) => fijarOrigenConCoords(lat, lon),
      () => estado("Abre Preferencias (⚙️) o pulsa 📍 para indicar tu ubicación.")
    );
  } else {
    estado("Abre Preferencias (⚙️) para buscar una dirección.");
  }
}
