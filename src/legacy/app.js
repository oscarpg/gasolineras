/*
 * LEGACY APP CODE (temporary).
 *
 * This is the original inline <script> from index.html, moved here unchanged in
 * Phase 2 so it can import the new TypeScript modules. Pure logic now lives in
 * src/config/ and src/domain/ (with unit tests); the Spanish names below are thin
 * aliases/adapters so the rest of this file didn't have to change.
 *
 * This file shrinks in every phase and is deleted at the end of Phase 5:
 *   Phase 3 → fetch/cache code moves to services/ and storage/
 *   Phase 4 → globals and pintar()'s filtering move to state/
 *   Phase 5 → DOM rendering moves to ui/, strings to i18n/
 *
 * Not linted or type-checked on purpose (see eslint.config.js / .prettierignore).
 * Leaflet is still loaded as a global `L` from the CDN <script> in index.html.
 */
import { FUELS } from '../config/fuels';
import { KNOWN_BRANDS } from '../config/brands';
import {
  CORS_RELAYS,
  MITECO_PROVINCE_HISTORY_URL,
  MITECO_PROVINCE_URL,
  NOMINATIM_REVERSE_URL,
  NOMINATIM_SEARCH_URL,
  OSRM_ROUTE_URL
} from '../config/endpoints';
import { normalizeBrand } from '../domain/brands';
import { colorForValue } from '../domain/colorScale';
import { toMitecoDate } from '../domain/dates';
import { distanceKm, distanceToRouteKm } from '../domain/geo';
import { parseSpanishNumber } from '../domain/numbers';
import { costBreakdown, effectivePrice } from '../domain/pricing';
import { provinceCodeFromAddress } from '../domain/provinces';
import { computeStaleness } from '../domain/staleness';
import { ageFilterFromSelectValue, matchesAgeFilter, requiredHistoryDays } from '../domain/ageFilter';
import { significantPricePoints } from '../domain/priceHistory';

/* ============ Alias de nombres antiguos ============ */
const API_PROVINCIA = MITECO_PROVINCE_URL;
const API_HIST_PROVINCIA = MITECO_PROVINCE_HISTORY_URL;
const OSRM = OSRM_ROUTE_URL;
const NOMINATIM_SEARCH = NOMINATIM_SEARCH_URL;
const NOMINATIM_REVERSE = NOMINATIM_REVERSE_URL;
const MARCAS_CONOCIDAS = KNOWN_BRANDS;

const normalizarMarca = normalizeBrand;
const colorPorValor = colorForValue;
const numEs = parseSpanishNumber;
const distKm = distanceKm;
const distARutaKm = distanceToRouteKm;
const extraerCodProvincia = provinceCodeFromAddress;
const formatearFechaMiteco = toMitecoDate;

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

/* ============ Control de UI (Drawer y Panel flotante) ============ */
const drawerPrefs = document.getElementById("drawerPrefs");
const backdropPrefs = document.getElementById("backdropPrefs");

function abrirPreferencias() {
  drawerPrefs.classList.add("abierto");
  backdropPrefs.classList.add("activo");
}
function cerrarPreferencias() {
  drawerPrefs.classList.remove("abierto");
  backdropPrefs.classList.remove("activo");
}

document.getElementById("btnAbrirPrefs").onclick = abrirPreferencias;
document.getElementById("btnCerrarPrefs").onclick = cerrarPreferencias;
backdropPrefs.onclick = cerrarPreferencias;

document.getElementById("toggleBaratas").onclick = () => {
  const panel = document.getElementById("panelBaratas");
  const minimizado = panel.classList.toggle("minimizado");
  document.getElementById("iconoToggleBaratas").textContent = minimizado ? "▲" : "▼";
};

/* ============ Estado y Mapa ============ */
let estaciones = [];
let provinciasCargadas = new Set();
let maxDiasCalculadosPorProv = new Map();
let calculandoAntiguedad = false;
let userPos = null;
let ruta = null;
let capaEstaciones = null, capaRuta = null, marcadorUsuario = null;
let prefs = JSON.parse(localStorage.getItem("gasolineras_prefs") || "{}");

const mapa = L.map("mapa").setView([40.4168, -3.7038], 6);
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a> · Precios: MITECO"
}).addTo(mapa);
capaEstaciones = L.layerGroup().addTo(mapa);
capaRuta = L.layerGroup().addTo(mapa);

/* ============ Inicialización de Selects de Combustible ============ */
const selCarb = document.getElementById("carburante");
const selCocheFuel = document.getElementById("cocheFuel");
for (const [k, f] of Object.entries(FUELS)) {
  const o1 = document.createElement("option");
  o1.value = k; o1.textContent = f.label;
  selCarb.appendChild(o1);

  const o2 = document.createElement("option");
  o2.value = k; o2.textContent = f.label;
  selCocheFuel.appendChild(o2);
}

/* ============ Carga de Preferencias ============ */
const OPCIONES_ANTIGUEDAD_VALIDAS = new Set(["TODAS", "0", "1", "2", "3", "MAX_X", "EXACTO_1", "EXACTO_2", "MAS_3", "MAS_X"]);
const selAntiguedad = document.getElementById("antiguedad");
const inpDiasDrawer = document.getElementById("diasAntiguedadVal");

let coches = prefs.cars || [];
let cocheActivoId = prefs.activeCarId || (coches[0]?.id ?? "");
let marcasSel = new Set(prefs.brands || []);
let descuentos = prefs.discounts || {};

selCarb.value = FUELS[prefs.fuel] ? prefs.fuel : "GASOLINA_95";
const antGuardada = OPCIONES_ANTIGUEDAD_VALIDAS.has(prefs.antiguedad) ? prefs.antiguedad : "TODAS";
selAntiguedad.value = antGuardada;

const diasCustomGuardados = Math.min(10, Math.max(1, parseInt(prefs.antiguedadDias, 10) || 3));
inpDiasDrawer.value = diasCustomGuardados;

document.getElementById("radioUbicacion").value = prefs.searchRadius || 15;
document.getElementById("radioUbicacionVal").textContent = prefs.searchRadius || 15;
document.getElementById("radio").value = prefs.radius || 3;
document.getElementById("radioVal").textContent = prefs.radius || 3;
document.getElementById("soloRuta").checked = !!prefs.soloRuta;
document.getElementById("chkOrdenCosteReal").checked = !!prefs.sortByRealCost;

function actualizarVisibilidadDiasCustom() {
  const val = selAntiguedad.value;
  const usaCustom = val === "MAX_X" || val === "MAS_X";
  document.getElementById("filaDiasCustom").hidden = !usaCustom;
}
actualizarVisibilidadDiasCustom();

function obtenerCocheActivo() {
  return coches.find(c => c.id === cocheActivoId) || null;
}

const cocheInicial = obtenerCocheActivo();
if (cocheInicial) {
  selCarb.value = cocheInicial.fuel;
}

function guardarPrefs() {
  prefs = {
    fuel: selCarb.value,
    antiguedad: selAntiguedad.value,
    antiguedadDias: +inpDiasDrawer.value || 3,
    searchRadius: +document.getElementById("radioUbicacion").value,
    radius: +document.getElementById("radio").value,
    soloRuta: document.getElementById("soloRuta").checked,
    sortByRealCost: document.getElementById("chkOrdenCosteReal").checked,
    brands: [...marcasSel],
    discounts: descuentos,
    cars: coches,
    activeCarId: cocheActivoId
  };
  localStorage.setItem("gasolineras_prefs", JSON.stringify(prefs));
}

function actualizarEstadoCheckboxCoste() {
  const coche = obtenerCocheActivo();
  const chk = document.getElementById("chkOrdenCosteReal");
  const cont = document.getElementById("contenedorChkCoste");
  const lbl = document.getElementById("lblOrdenCosteReal");

  if (!coche) {
    chk.disabled = true;
    cont.classList.add("deshabilitado");
    lbl.textContent = "Selecciona un coche para ordenar por coste total (depósito + viaje)";
  } else {
    chk.disabled = false;
    cont.classList.remove("deshabilitado");
    lbl.textContent = `Ordenar por coste total con ${coche.nombre} (depósito + ida y vuelta)`;
  }
}

/* ============ Gestión de Coches ============ */
function actualizarUICoches() {
  actualizarEstadoCheckboxCoste();

  const cont = document.getElementById("listaCoches");
  cont.innerHTML = "";
  if (coches.length === 0) {
    cont.innerHTML = `<small class="u-text-muted">No hay coches configurados.</small>`;
    return;
  }

  for (const c of coches) {
    const esActivo = c.id === cocheActivoId;
    const div = document.createElement("div");
    div.className = `coche-item ${esActivo ? "activo" : ""}`;
    div.innerHTML = `
      <div class="coche-info">
        <div><b>${c.nombre}</b> ${esActivo ? `<span class="badge-desc">Activo</span>` : ""}</div>
        <div class="coche-meta">
          ${FUELS[c.fuel]?.label} · Depósito: ${c.deposito} L · ${c.consumo} l/100km
        </div>
      </div>
      <div class="coche-acciones">
        ${!esActivo ? `<button class="sec btn-mini btn-usar">Usar</button>` : ""}
        <button class="btn-del" title="Eliminar coche">✕</button>
      </div>
    `;

    const btnUsar = div.querySelector(".btn-usar");
    if (btnUsar) {
      btnUsar.onclick = () => seleccionarCoche(c.id);
    }
    div.querySelector(".btn-del").onclick = () => {
      coches = coches.filter(item => item.id !== c.id);
      if (cocheActivoId === c.id) {
        cocheActivoId = coches[0]?.id || "";
        const nuevoActivo = obtenerCocheActivo();
        if (nuevoActivo) selCarb.value = nuevoActivo.fuel;
      }
      guardarPrefs();
      actualizarUICoches();
      pintar();
    };
    cont.appendChild(div);
  }
}

function seleccionarCoche(id) {
  cocheActivoId = id;
  const coche = obtenerCocheActivo();
  if (coche) {
    selCarb.value = coche.fuel;
  }
  guardarPrefs();
  actualizarUICoches();
  pintar();
}

document.getElementById("chkOrdenCosteReal").onchange = () => {
  guardarPrefs();
  pintar();
};

document.getElementById("btnGuardarCoche").onclick = () => {
  const nombre = document.getElementById("cocheNombre").value.trim();
  const fuel = selCocheFuel.value;
  const deposito = parseFloat(document.getElementById("cocheDeposito").value);
  const consumo = parseFloat(document.getElementById("cocheConsumo").value);

  if (!nombre || !Number.isFinite(deposito) || deposito <= 0 || !Number.isFinite(consumo) || consumo <= 0) {
    alert("Completa el nombre, tamaño de depósito (L) y consumo (l/100km).");
    return;
  }

  const existente = coches.find(c => c.nombre.toLowerCase() === nombre.toLowerCase());
  if (existente) {
    existente.fuel = fuel;
    existente.deposito = deposito;
    existente.consumo = consumo;
    cocheActivoId = existente.id;
  } else {
    const nuevo = {
      id: "car_" + Date.now(),
      nombre,
      fuel,
      deposito,
      consumo
    };
    coches.push(nuevo);
    cocheActivoId = nuevo.id;
  }

  selCarb.value = fuel;
  document.getElementById("cocheNombre").value = "";
  document.getElementById("cocheDeposito").value = "";
  document.getElementById("cocheConsumo").value = "";

  guardarPrefs();
  actualizarUICoches();
  pintar();
};

/* ============ Descuentos y Costes ============ */
function descuentoDeMarca(marca) {
  const d = descuentos[marca];
  return d ? { type: d.tipo, value: d.valor } : null;
}

function obtenerPrecioEfectivo(estacion, fuel) {
  return effectivePrice(estacion.precios?.[fuel], descuentoDeMarca(estacion.marca));
}

function calcularDesgloseCoche(estacion, fuel, coche) {
  const precioFinal = obtenerPrecioEfectivo(estacion, fuel);
  const distUbicacion = userPos ? distKm([estacion.lat, estacion.lon], userPos) : null;
  const distDesvioRuta = ruta ? distARutaKm([estacion.lat, estacion.lon], ruta) : null;
  const coste = costBreakdown(
    precioFinal,
    ruta ? distDesvioRuta : distUbicacion,
    coche ? { tankLitres: coche.deposito, consumptionL100km: coche.consumo } : null
  );
  return {
    precioFinal,
    distUbicacion,
    distDesvioRuta,
    distIdaVueltaKm: coste.roundTripKm,
    costeDeposito: coste.tankCost,
    litrosViaje: coste.tripLitres,
    costeViaje: coste.tripCost,
    costeTotal: coste.totalCost
  };
}

function etiquetaDescuento(marca) {
  const d = descuentos[marca];
  if (!d || !d.valor) return "";
  return d.tipo === "PCT" ? `-${d.valor}%` : `-${d.valor} cts/l`;
}

function actualizarUIDescuentos() {
  const sel = document.getElementById("descMarca");
  const valorActual = sel.value;

  const todasMarcas = new Set([...MARCAS_CONOCIDAS.map(normalizarMarca), ...estaciones.map(e => e.marca)]);
  const ordenadas = [...todasMarcas].sort((a, b) => a.localeCompare(b, "es"));

  sel.innerHTML = `<option value="">Selecciona una marca…</option>`;
  for (const m of ordenadas) {
    const opt = document.createElement("option");
    opt.value = m;
    opt.textContent = m;
    sel.appendChild(opt);
  }
  if (todasMarcas.has(valorActual)) sel.value = valorActual;

  const cont = document.getElementById("listaDescuentos");
  cont.innerHTML = "";
  const entradas = Object.entries(descuentos);
  if (entradas.length === 0) {
    cont.innerHTML = `<small class="u-text-muted">Sin descuentos configurados.</small>`;
    return;
  }

  for (const [marca] of entradas) {
    const div = document.createElement("div");
    div.className = "desc-item";
    div.innerHTML = `
      <span><b>${marca}</b>: ${etiquetaDescuento(marca)}</span>
      <button class="btn-del" title="Eliminar descuento">✕</button>
    `;
    div.querySelector("button").onclick = () => {
      delete descuentos[marca];
      guardarPrefs();
      actualizarUIDescuentos();
      pintar();
    };
    cont.appendChild(div);
  }
}

document.getElementById("btnAddDesc").onclick = () => {
  const marca = document.getElementById("descMarca").value;
  const valor = parseFloat(document.getElementById("descValor").value);
  const tipo = document.getElementById("descTipo").value;
  if (!marca || !Number.isFinite(valor) || valor <= 0) return;

  descuentos[marca] = { tipo, valor };
  document.getElementById("descValor").value = "";
  guardarPrefs();
  actualizarUIDescuentos();
  pintar();
};

/* ============ Utilidades ============ */
function estado(msg) { document.getElementById("estado").textContent = msg; }

/* ============ Descarga directa + proxies de respaldo ============ */
async function fetchConProxy(url) {
  const intentos = [
    () => fetch(url, { headers: { "Accept": "application/json" } }),
    () => fetch(url),
    async () => {
      const r = await fetch(CORS_RELAYS.allOrigins(url));
      if (!r.ok) throw new Error("HTTP " + r.status);
      const data = await r.json();
      return new Response(data.contents);
    },
    () => fetch(CORS_RELAYS.codeTabs(url))
  ];

  for (const ejecutarFetch of intentos) {
    try {
      const resp = await ejecutarFetch();
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      const texto = (await resp.text()).trim();
      if (!texto) throw new Error("Respuesta vacía");

      if (texto.startsWith("<")) {
        return xmlAEstaciones(texto);
      }
      return JSON.parse(texto);
    } catch (e) {
      console.warn("Intento de descarga falló:", e.message);
    }
  }
  throw new Error("No se pudo descargar la información de las gasolineras.");
}

function decodificarTag(tag) {
  return tag.replace(/_x([0-9A-Fa-f]{4})_/g,
    (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function xmlAEstaciones(texto) {
  const doc = new DOMParser().parseFromString(texto, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("XML mal formado");
  const items = [...doc.querySelectorAll("EESSPrecio")];
  if (items.length === 0) throw new Error("El XML no contiene estaciones");
  return {
    Fecha: doc.querySelector("Fecha")?.textContent || "",
    ListaEESSPrecio: items.map(el => {
      const obj = {};
      for (const child of el.children) {
        obj[decodificarTag(child.tagName)] = child.textContent;
      }
      return obj;
    })
  };
}

/* ============ Carga de gasolineras por provincia ============ */
function diasHistoricoRequeridos() {
  return requiredHistoryDays(ageFilterFromSelectValue(selAntiguedad.value, +inpDiasDrawer.value || 3));
}

async function cargarProvincia(codProvincia, forzar = false) {
  if (!codProvincia) return;
  if (!forzar && provinciasCargadas.has(codProvincia)) return;

  const hoy = new Date().toISOString().slice(0, 10);
  const cacheKey = `gasolineras_prov_${codProvincia}`;
  const cache = JSON.parse(localStorage.getItem(cacheKey) || "null");

  if (!forzar && cache && cache.fecha === hoy && cache.datos?.[0]?.ideess !== undefined) {
    incorporarEstaciones(cache.datos);
    provinciasCargadas.add(codProvincia);
    calcularAntiguedadPrecios(codProvincia, diasHistoricoRequeridos());
    return;
  }

  estado(`Descargando datos de la provincia (${codProvincia})…`);
  try {
    const url = `${API_PROVINCIA}${codProvincia}`;
    const json = await fetchConProxy(url);
    const fechaMiteco = (json.Fecha || "").split(" ")[0] || formatearFechaMiteco(new Date());

    const nuevas = (json.ListaEESSPrecio || []).map(e => ({
      id: `${e["IDEESS"] || e["Rótulo"]}-${e["Latitud"]}-${e["Longitud (WGS84)"]}`,
      ideess: e["IDEESS"] || "",
      codProvincia,
      fechaMiteco,
      rotulo: e["Rótulo"] || "Sin nombre",
      direccion: [e["Dirección"], e["Localidad"], e["Provincia"]].filter(Boolean).join(", "),
      lat: numEs(e["Latitud"]),
      lon: numEs(e["Longitud (WGS84)"]),
      horario: e["Horario"] || "",
      precios: Object.fromEntries(Object.entries(FUELS).map(([k, f]) => [k, numEs(e[f.mitecoField])]))
    })).filter(e => e.lat !== null && e.lon !== null);

    localStorage.setItem(cacheKey, JSON.stringify({ fecha: hoy, datos: nuevas }));
    incorporarEstaciones(nuevas);
    provinciasCargadas.add(codProvincia);
    calcularAntiguedadPrecios(codProvincia, diasHistoricoRequeridos());
  } catch (err) {
    estado("Error cargando provincia: " + err.message);
  }
}

function incorporarEstaciones(lista) {
  const ids = new Set(estaciones.map(e => e.id));
  for (const item of lista) {
    if (!ids.has(item.id)) {
      item.marca = normalizarMarca(item.rotulo);
      estaciones.push(item);
      ids.add(item.id);
    }
  }
  const marcasValidas = new Set(estaciones.map(e => e.marca));
  marcasSel = new Set([...marcasSel].map(normalizarMarca).filter(m => marcasValidas.has(m)));

  construirFiltroMarcas();
  actualizarUIDescuentos();
  pintar();
}

function construirFiltroMarcas() {
  const cont = document.getElementById("marcas");
  cont.innerHTML = "";

  const conteo = new Map();
  for (const e of estaciones) {
    conteo.set(e.marca, (conteo.get(e.marca) || 0) + 1);
  }
  const marcas = [...conteo.keys()].sort((a, b) => a.localeCompare(b, "es"));

  if (marcas.length === 0) {
    cont.innerHTML = `<em class="u-text-sm">Sin gasolineras</em>`;
    return;
  }
  const todas = document.createElement("label");
  todas.innerHTML = `<input type="checkbox" id="chkTodas" ${marcasSel.size === 0 ? "checked" : ""}> Todas (${marcas.length})`;
  cont.appendChild(todas);
  todas.querySelector("input").onchange = e => {
    marcasSel = e.target.checked ? new Set() : new Set(marcas);
    guardarPrefs(); construirFiltroMarcas(); pintar();
  };
  for (const m of marcas) {
    const lb = document.createElement("label");
    lb.innerHTML = `<input type="checkbox" ${marcasSel.has(m) ? "checked" : ""}> ${m} (${conteo.get(m)})`;
    lb.querySelector("input").onchange = ev => {
      ev.target.checked ? marcasSel.add(m) : marcasSel.delete(m);
      guardarPrefs(); pintar();
    };
    cont.appendChild(lb);
  }
}

/* ============ Pintar en el mapa y lista ============ */
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

function pintar() {
  guardarPrefs();
  capaEstaciones.clearLayers();
  const fuel = selCarb.value;
  const coche = obtenerCocheActivo();
  const ordenarPorCosteReal = !!(coche && document.getElementById("chkOrdenCosteReal").checked);
  const filtroAnt = selAntiguedad.value || "TODAS";
  const diasX = Math.max(1, +inpDiasDrawer.value || 3);
  const limiteRuta = document.getElementById("soloRuta").checked ? 0.15 : +document.getElementById("radio").value;
  const radioUbicacion = +document.getElementById("radioUbicacion").value;

  const filtradas = estaciones.filter(e =>
    (marcasSel.size === 0 || marcasSel.has(e.marca)) &&
    e.precios[fuel] != null &&
    cumpleFiltroAntiguedad(e, fuel, filtroAnt, diasX) &&
    (ruta ? distARutaKm([e.lat, e.lon], ruta) <= limiteRuta
          : (userPos ? distKm([e.lat, e.lon], userPos) <= radioUbicacion : false))
  );

  const desgloses = new Map();
  for (const e of filtradas) {
    desgloses.set(e.id, calcularDesgloseCoche(e, fuel, coche));
  }

  filtradas.sort((a, b) => {
    const da = desgloses.get(a.id);
    const db = desgloses.get(b.id);
    if (ordenarPorCosteReal && da.costeTotal != null && db.costeTotal != null) {
      return da.costeTotal - db.costeTotal;
    }
    return da.precioFinal - db.precioFinal;
  });

  const valorMetrica = e => {
    const d = desgloses.get(e.id);
    return (ordenarPorCosteReal && d.costeTotal != null) ? d.costeTotal : d.precioFinal;
  };

  const minVal = filtradas.length ? valorMetrica(filtradas[0]) : 0;
  const maxVal = filtradas.length ? valorMetrica(filtradas[filtradas.length - 1]) : 0;

  const marcadoresPorId = new Map();

  for (const e of filtradas) {
    const precioBase = e.precios[fuel];
    const d = desgloses.get(e.id);
    const precioFinal = d.precioFinal;
    const tieneDesc = precioFinal < precioBase;
    const color = colorPorValor(valorMetrica(e), minVal, maxVal);

    const distTexto = ruta
      ? `<br><small>🛣️ Desvío de ruta: ${d.distDesvioRuta.toFixed(1)} km (${d.distIdaVueltaKm.toFixed(1)} km i/v)</small>`
      : (d.distUbicacion !== null ? `<br><small>📍 A ${d.distUbicacion.toFixed(1)} km (${d.distIdaVueltaKm.toFixed(1)} km i/v)</small>` : "");

    let infoCochePopup = "";
    if (coche && d.costeTotal != null) {
      infoCochePopup =
        `<br><small class="popup-coche">` +
        `🚗 <b>${coche.nombre}</b> (${coche.deposito}L):<br>` +
        `• Depósito: ${d.costeDeposito.toFixed(2)} €<br>` +
        `• Desplazamiento i/v (${d.distIdaVueltaKm.toFixed(1)} km · ${d.litrosViaje.toFixed(2)}L): +${d.costeViaje.toFixed(2)} €<br>` +
        `• <b>Total real: ${d.costeTotal.toFixed(2)} €</b>` +
        `</small>`;
    }

    const btnHist = e.ideess
      ? `<br><button class="sec btn-historial" onclick="verEvolucion('${e.ideess}', '${e.codProvincia}', '${e.id}')">📈 Ver evolución (7 días)</button><div id="grafica-${e.ideess}"></div>`
      : "";

    const htmlPrecioPopup = tieneDesc
      ? `<span class="precio" style="color:${color}">${FUELS[fuel].label}: ${precioFinal.toFixed(3)} €/l</span>` +
        `<span class="precio-tachado">${precioBase.toFixed(3)} €/l</span>` +
        `<span class="badge-desc">${etiquetaDescuento(e.marca)}</span>`
      : `<span class="precio" style="color:${color}">${FUELS[fuel].label}: ${precioFinal.toFixed(3)} €/l</span>`;

    const marker = L.marker([e.lat, e.lon], { icon: crearIconoGasolinera(color) }).bindPopup(
      `<b>${e.rotulo}</b><br><small>${e.direccion}</small><br>` +
      htmlPrecioPopup +
      infoCochePopup +
      `<br><small>${textoAntiguedad(e, fuel)}</small>` +
      distTexto +
      (e.horario ? `<br><small>${e.horario}</small>` : "") +
      btnHist
    ).addTo(capaEstaciones);

    marcadoresPorId.set(e.id, marker);
  }

  const contLista = document.getElementById("listaBaratas");
  contLista.innerHTML = "";

  if (filtradas.length === 0) {
    contLista.innerHTML = `<em class="u-text-sm u-text-muted">Ninguna gasolinera cumple el filtro.</em>`;
  } else {
    for (const [idx, e] of filtradas.slice(0, 20).entries()) {
      const precioBase = e.precios[fuel];
      const d = desgloses.get(e.id);
      const precioFinal = d.precioFinal;
      const tieneDesc = precioFinal < precioBase;
      const color = colorPorValor(valorMetrica(e), minVal, maxVal);

      const card = document.createElement("div");
      card.className = "item-gasolinera";

      const textoDistancia = ruta
        ? `🛣️ Desvío ${d.distDesvioRuta.toFixed(1)} km · `
        : (d.distUbicacion !== null ? `📍 ${d.distUbicacion.toFixed(1)} km · ` : "");

      let lineaCoche = "";
      let bloqueDerecho = `
        <div class="importe" style="color:${color}">${precioFinal.toFixed(3)} €/l</div>
        ${tieneDesc ? `<div class="precio-tachado u-ml-0">${precioBase.toFixed(3)} €/l</div>` : ""}
      `;

      if (coche && d.costeTotal != null) {
        lineaCoche = `
          <div class="meta-coche">
            🚗 Depósito: ${d.costeDeposito.toFixed(2)} € + Viaje i/v: ${d.costeViaje.toFixed(2)} € = <b>${d.costeTotal.toFixed(2)} €</b>
          </div>
        `;
        if (ordenarPorCosteReal) {
          bloqueDerecho = `
            <div class="importe" style="color:${color}">${d.costeTotal.toFixed(2)} €</div>
            <div class="sub-importe">${precioFinal.toFixed(3)} €/l</div>
            ${tieneDesc ? `<div class="precio-tachado u-ml-0">${precioBase.toFixed(3)} €/l</div>` : ""}
          `;
        } else {
          bloqueDerecho = `
            <div class="importe" style="color:${color}">${precioFinal.toFixed(3)} €/l</div>
            ${tieneDesc ? `<div class="precio-tachado u-ml-0">${precioBase.toFixed(3)} €/l</div>` : ""}
            <div class="sub-importe">Total: ${d.costeTotal.toFixed(2)} €</div>
          `;
        }
      }

      card.innerHTML = `
        <div class="info">
          <div class="nombre">
            ${idx + 1}. ${e.rotulo}
            ${tieneDesc ? `<span class="badge-desc">${etiquetaDescuento(e.marca)}</span>` : ""}
          </div>
          <div class="meta">${textoDistancia}${e.direccion}</div>
          ${lineaCoche}
          <div class="meta">${textoAntiguedad(e, fuel)}</div>
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
    `${filtradas.length} gasolineras · ${FUELS[fuel].label}` +
    (coche ? ` · ${coche.nombre}` : "") +
    etiquetaResumenAntiguedad(filtroAnt, diasX) +
    (calculandoAntiguedad ? " · ⏳ comprobando histórico…" : "") +
    (ordenarPorCosteReal ? " · orden: coste total" : " · orden: €/l") +
    (ruta ? " · en ruta" : ` · máx. ${radioUbicacion} km`)
  );
}

/* ============ Fijar Origen y Ubicación ============ */
async function fijarOrigenConCoords(lat, lon, zoom = 13, codProvincia = null) {
  userPos = [lat, lon];
  if (marcadorUsuario) mapa.removeLayer(marcadorUsuario);
  marcadorUsuario = L.marker([lat, lon], { icon: iconoUsuario, zIndexOffset: 1000 }).addTo(mapa)
    .bindPopup("<b>Tu ubicación / Origen</b>").openPopup();
  mapa.setView([lat, lon], zoom);

  if (!codProvincia) {
    estado("Determinando provincia…");
    try {
      const resp = await fetch(`${NOMINATIM_REVERSE}&lat=${lat}&lon=${lon}`);
      const data = await resp.json();
      codProvincia = extraerCodProvincia(data.address);
    } catch (_) {}
  }

  if (codProvincia) {
    await cargarProvincia(codProvincia);
  } else {
    estado("No se pudo determinar la provincia correspondiente.");
  }
  pintar();
}

function pedirGps() {
  estado("Obteniendo ubicación GPS…");
  navigator.geolocation.getCurrentPosition(
    pos => fijarOrigenConCoords(pos.coords.latitude, pos.coords.longitude),
    err => estado("Error GPS: " + err.message + ". Usa Preferencias para buscar dirección.")
  );
}

document.getElementById("btnGps").onclick = () => { pedirGps(); cerrarPreferencias(); };
document.getElementById("btnGpsRapido").onclick = pedirGps;

document.getElementById("btnDir").onclick = async () => {
  const q = document.getElementById("direccion").value.trim();
  if (!q) return;
  estado("Buscando dirección…");
  try {
    const r = await fetch(NOMINATIM_SEARCH + encodeURIComponent(q));
    const res = await r.json();
    if (res.length === 0) { estado("Dirección no encontrada"); return; }
    const cod = extraerCodProvincia(res[0].address);
    await fijarOrigenConCoords(+res[0].lat, +res[0].lon, 13, cod);
    cerrarPreferencias();
  } catch (e) { estado("Error: " + e.message); }
};

/* ============ Rutas ============ */
document.getElementById("btnRuta").onclick = async () => {
  const q = document.getElementById("destino").value.trim();
  if (!q) return;
  if (!userPos) { estado("Indica primero tu ubicación de origen"); return; }
  estado("Calculando ruta…");
  try {
    const r = await fetch(NOMINATIM_SEARCH + encodeURIComponent(q));
    const res = await r.json();
    if (res.length === 0) { estado("Destino no encontrado"); return; }
    
    const codDest = extraerCodProvincia(res[0].address);
    if (codDest && !provinciasCargadas.has(codDest)) {
      await cargarProvincia(codDest);
    }

    const dest = [+res[0].lat, +res[0].lon];
    const url = `${OSRM}${userPos[1]},${userPos[0]};${dest[1]},${dest[0]}?overview=full&geometries=geojson`;
    const rr = await fetch(url);
    const rjson = await rr.json();
    if (rjson.code !== "Ok") { estado("No se pudo calcular la ruta"); return; }

    ruta = rjson.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
    capaRuta.clearLayers();
    L.polyline(ruta, { color: "#1565C0", weight: 6 }).addTo(capaRuta);
    mapa.fitBounds(L.latLngBounds(ruta));
    pintar();
    cerrarPreferencias();
  } catch (e) { estado("Error de ruta: " + e.message); }
};

document.getElementById("btnQuitarRuta").onclick = () => {
  ruta = null;
  capaRuta.clearLayers();
  pintar();
};

/* ============ Eventos de Preferencias y Sincronización de Antigüedad ============ */
async function asegurarHistoricoParaFiltro() {
  const req = diasHistoricoRequeridos();
  for (const cod of provinciasCargadas) {
    const calc = maxDiasCalculadosPorProv.get(cod) || 0;
    if (req > calc) {
      await calcularAntiguedadPrecios(cod, req);
    }
  }
}

selAntiguedad.onchange = () => {
  actualizarVisibilidadDiasCustom();
  asegurarHistoricoParaFiltro();
  pintar();
};
inpDiasDrawer.onchange = () => {
  asegurarHistoricoParaFiltro();
  pintar();
};

selCarb.onchange = () => {
  const coche = obtenerCocheActivo();
  if (coche && coche.fuel !== selCarb.value) {
    cocheActivoId = "";
  }
  actualizarUICoches();
  pintar();
};
document.getElementById("soloRuta").onchange = pintar;
document.getElementById("radioUbicacion").oninput = e => {
  document.getElementById("radioUbicacionVal").textContent = e.target.value;
  pintar();
};
document.getElementById("radio").oninput = e => {
  document.getElementById("radioVal").textContent = e.target.value;
  pintar();
};
document.getElementById("btnActualizar").onclick = async () => {
  maxDiasCalculadosPorProv.clear();
  for (const cod of [...provinciasCargadas]) {
    await cargarProvincia(cod, true);
  }
};

/* ============ Histórico, Antigüedad y Gráfica ============ */
async function obtenerHistoricoDiaProvincia(codProvincia, fechaStr) {
  const cacheKey = `gas_hist_${codProvincia}_${fechaStr}`;
  const cacheado = localStorage.getItem(cacheKey);
  if (cacheado) return JSON.parse(cacheado);

  const url = `${API_HIST_PROVINCIA}${fechaStr}/${codProvincia}`;
  const json = await fetchConProxy(url);
  const mapaDia = {};

  for (const e of (json.ListaEESSPrecio || [])) {
    const id = e["IDEESS"];
    if (!id) continue;
    mapaDia[id] = Object.fromEntries(
      Object.entries(FUELS)
        .map(([k, f]) => [k, numEs(e[f.mitecoField])])
        .filter(([, val]) => val !== null)
    );
  }

  try {
    localStorage.setItem(cacheKey, JSON.stringify(mapaDia));
  } catch (_) {
    Object.keys(localStorage)
      .filter(k => k.startsWith("gas_hist_"))
      .slice(0, 5)
      .forEach(k => localStorage.removeItem(k));
  }
  return mapaDia;
}

async function calcularAntiguedadPrecios(codProvincia, maxDias = 4) {
  const hoy = new Date();
  const listaIndices = Array.from({ length: maxDias }, (_, i) => i + 1);
  const diasAtras = listaIndices.map(d => {
    const fecha = new Date(hoy);
    fecha.setDate(hoy.getDate() - d);
    return { dias: d, fechaStr: formatearFechaMiteco(fecha) };
  });

  const infoEl = document.getElementById("infoEstadoAntiguedad");
  calculandoAntiguedad = true;
  if (infoEl) infoEl.textContent = `⏳ Comprobando histórico de precios (${maxDias} días)…`;
  pintar();

  try {
    const historicos = await Promise.all(
      diasAtras.map(d => obtenerHistoricoDiaProvincia(codProvincia, d.fechaStr).catch(() => null))
    );

    const fechaHoyStr = formatearFechaMiteco(hoy);

    for (const e of estaciones) {
      if (e.codProvincia !== codProvincia || !e.ideess) continue;
      e.antiguedad = {};

      for (const fuel of Object.keys(FUELS)) {
        const precioHoy = e.precios[fuel];
        if (precioHoy == null) continue;

        const historial = diasAtras.map((d, i) =>
          historicos[i] ? { daysAgo: d.dias, date: d.fechaStr, price: historicos[i][e.ideess]?.[fuel] ?? null } : null
        );
        const { days, since } = computeStaleness(precioHoy, historial, e.fechaMiteco || fechaHoyStr);

        e.antiguedad[fuel] = { dias: days, fecha: since, maxComprobado: maxDias - 1 };
      }
    }
    maxDiasCalculadosPorProv.set(codProvincia, maxDias);
    if (infoEl) infoEl.textContent = `✅ Histórico comprobado (${maxDias} días hacia atrás).`;
  } catch (err) {
    console.warn("No se pudo calcular la antigüedad de precios:", err);
    if (infoEl) infoEl.textContent = `⚠️ No se pudo comprobar todo el histórico.`;
  } finally {
    calculandoAntiguedad = false;
    pintar();
  }
}

function textoAntiguedad(estacion, fuel) {
  const info = estacion.antiguedad?.[fuel];
  if (!info) {
    return estacion.fechaMiteco ? `📅 Boletín MITECO: ${estacion.fechaMiteco} (comprobando histórico…)` : "📅 Comprobando histórico…";
  }
  const tope = info.maxComprobado || 3;
  if (info.dias === 0) return `🟢 Actualizado hoy (${info.fecha})`;
  if (info.dias === 1) return `🕒 1 día sin actualizar (desde ${info.fecha})`;
  if (info.dias <= tope) return `🕒 ${info.dias} días sin actualizar (desde ${info.fecha})`;
  return `⚠️ +${tope} días sin actualizar (≤ ${info.fecha})`;
}

function cumpleFiltroAntiguedad(estacion, fuel, filtro, diasX = 3) {
  return matchesAgeFilter(estacion.antiguedad?.[fuel]?.dias, ageFilterFromSelectValue(filtro, diasX));
}

async function verEvolucion(ideess, codProvincia, idEstacion) {
  const cont = document.getElementById(`grafica-${ideess}`);
  if (!cont) return;
  const fuel = selCarb.value;
  cont.innerHTML = `<small class="u-text-muted">Cargando histórico de 7 días…</small>`;

  try {
    const hoy = new Date();
    const fechas = [];
    for (let i = 6; i >= 1; i--) {
      const d = new Date(hoy);
      d.setDate(hoy.getDate() - i);
      fechas.push({
        etiqueta: `${d.getDate()}/${d.getMonth() + 1}`,
        fechaMiteco: formatearFechaMiteco(d)
      });
    }

    const resultados = await Promise.all(
      fechas.map(f => obtenerHistoricoDiaProvincia(codProvincia, f.fechaMiteco).catch(() => null))
    );

    const serie = fechas.map((f, idx) => ({
      idx,
      etiqueta: f.etiqueta,
      precio: resultados[idx]?.[ideess]?.[fuel] ?? null
    }));

    const estHoy = estaciones.find(e => e.id === idEstacion);
    serie.push({
      idx: 6,
      etiqueta: "Hoy",
      precio: estHoy?.precios?.[fuel] ?? null
    });

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

  const coords = puntosReales.map(p => ({
    x: xPos(p.idx),
    y: yPos(p.precio),
    ...p
  }));

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

/* ============ Puente temporal para HTML generado ============ */
// Los popups usan onclick="verEvolucion(...)". En un módulo las funciones no son
// globales, así que se exponen aquí hasta que la Fase 5 use delegación de eventos.
window.verEvolucion = verEvolucion;

/* ============ Inicio automático ============ */
actualizarUICoches();
actualizarUIDescuentos();

if (navigator.geolocation) {
  estado("Obteniendo tu ubicación…");
  navigator.geolocation.getCurrentPosition(
    pos => fijarOrigenConCoords(pos.coords.latitude, pos.coords.longitude),
    () => estado("Abre Preferencias (⚙️) o pulsa 📍 para indicar tu ubicación.")
  );
} else {
  estado("Abre Preferencias (⚙️) para buscar una dirección.");
}
