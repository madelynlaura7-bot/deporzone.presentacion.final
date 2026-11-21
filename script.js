/* DeporZone · Diseño Web II (SIS-0141) · C3-A2
   BEM + CLS + DOMPurify + Service Worker + Offline-First + anti-XSS + delegación (.off().on()) */
$(document).ready(function () {
  "use strict";

  /* ---------- Estado ---------- */
  var HORAS = ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00"];
  var CLAVE = "dz.reservas";
  var deporte = "futsal", canchaId = 1, fecha = "", hora = "", horas = 1;
  var canchas = [], filtro = "todas", timer = null, restante = 30, totalPrevio = 120;

  /* ---------- Utilidades ---------- */
  function log(t) {
    // Anti-XSS: el texto entra como nodo con .text(), nunca como HTML
    $("#logs").prepend($("<p>").text("• " + new Date().toLocaleTimeString() + " — " + t));
  }
  // Toast: aparece con slideDown(), permanece 3 s y se va con fadeOut()
  function toast(t) {
    $("#toast").stop(true, true).text(t).slideDown(250).delay(3000).fadeOut(350);
  }
  function hoyISO() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function fechaBonita(iso) { var p = iso.split("-"); return p[2] + "/" + p[1] + "/" + p[0]; }
  function nombreDeporte(d) { return d === "futsal" ? "Futsal" : "Wally"; }
  function cancha(id) { return canchas.filter(function (c) { return c.id === id; })[0]; }
  function precioActual() { var c = cancha(canchaId); return c ? c.precio : (deporte === "futsal" ? 80 : 60); }

  // DOMPurify: se sanitiza TODO HTML dinámico (JSON/BD) antes de inyectarlo con .html()
  function renderizarDetalleSeguro(htmlDesdeServidor) {
    var limpio = window.DOMPurify
      ? DOMPurify.sanitize(htmlDesdeServidor)
      : $("<div>").text(htmlDesdeServidor).html(); // respaldo: si DOMPurify no cargó, todo se escapa como texto
    $("#detalleProyecto").html(limpio);
  }

  /* ---------- Almacenamiento local (Offline-First) ---------- */
  function leer() {
    try { return JSON.parse(localStorage.getItem(CLAVE)) || []; } catch (e) { return []; }
  }
  function guardar(lista) {
    try { localStorage.setItem(CLAVE, JSON.stringify(lista)); } catch (e) { console.error("Sin almacenamiento local", e); }
  }
  // Un horario está ocupado si ya hay reserva guardada o si el sistema lo marca como tomado
  function ocupado(id, iso, h) {
    var ocupadoSistema = ((id * 7 + parseInt(iso.slice(-2), 10) * 3 + parseInt(h, 10)) % 5) === 0;
    if (ocupadoSistema) { return true; }
    var n = parseInt(h, 10);
    return leer().some(function (r) {
      return r.canchaId === id && r.fecha === iso && n >= parseInt(r.hora, 10) && n < parseInt(r.hora, 10) + r.horas;
    });
  }
  function bloqueLibre(id, iso, h, cant) {
    var inicio = HORAS.indexOf(h);
    if (inicio < 0 || inicio + cant > HORAS.length) { return false; }
    for (var i = 0; i < cant; i++) { if (ocupado(id, iso, HORAS[inicio + i])) { return false; } }
    return true;
  }

  /* ---------- Navegación por hash ---------- */
  function pagina() {
    var id = location.hash.slice(1) || "inicio";
    if (!$("#" + id).hasClass("vista")) { id = "inicio"; }
    $(".vista").removeClass("vista--activa");
    $("#" + id).addClass("vista--activa");
    $("#nav").removeClass("cabecera__nav--abierto");
    $("#hamb").attr("aria-expanded", "false");
  }
  $(window).off("hashchange.nav").on("hashchange.nav", pagina);
  $("#hamb").off("click").on("click", function () {
    var abierto = $("#nav").toggleClass("cabecera__nav--abierto").hasClass("cabecera__nav--abierto");
    $(this).attr("aria-expanded", abierto);
  });

  /* ---------- Estado de red (Offline-First) ---------- */
  function actualizarEstadoRed() {
    var $e = $("#estadoRed").removeClass("estado-red--online estado-red--offline");
    if (navigator.onLine) {
      $e.addClass("estado-red--online").text("● En línea");
      sincronizar();
    } else {
      $e.addClass("estado-red--offline").text("● Modo offline (datos locales)");
    }
  }
  function sincronizar() {
    var lista = leer(), n = 0;
    lista.forEach(function (r) { if (r.estado === "pendiente") { r.estado = "confirmada"; n++; } });
    if (n) {
      guardar(lista); pintarReservas();
      toast("✓ " + n + " reserva(s) verificada(s) al volver la conexión.");
      log("Sincronizadas " + n + " reservas pendientes");
    }
  }
  $(window).off("online.red offline.red").on("online.red offline.red", actualizarEstadoRed);

  /* ---------- Reserva: resumen, tema y horarios ---------- */
  function aplicarTema(d) {
    // Reto Jueves: addClass/removeClass cambia degradado e ícono sin recargar
    $("#reservaPanel").removeClass("reserva--futsal reserva--wally").addClass("reserva--" + d);
    $("#ball").text(d === "futsal" ? "⚽" : "🏐");
  }
  function pintarHorarios() {
    var $c = $("#horarios").empty();
    HORAS.forEach(function (h) {
      var busy = ocupado(canchaId, fecha, h);
      var $b = $("<button>").attr({ type: "button", "data-hora": h }).addClass("horarios__boton").text(h);
      if (busy) { $b.addClass("horarios__boton--ocupado").prop("disabled", true); }
      if (!busy && h === hora) { $b.addClass("horarios__boton--elegido"); }
      $c.append($b);
    });
    if (hora && ocupado(canchaId, fecha, hora)) { hora = ""; }
  }
  function actualizar() {
    var precio = precioActual(), sub = precio * horas, gar = sub * 0.5, total = sub + gar;
    var c = cancha(canchaId);
    $("#canchaTexto").text(c ? c.titulo : "—");
    $("#kindText").text(nombreDeporte(deporte));
    $("#timeText").text(hora ? fechaBonita(fecha) + " · " + hora : "Sin seleccionar");
    $("#hoursText").text(horas);
    $("#rate").text("Bs " + precio);
    $("#subtotal").text("Bs " + sub);
    $("#guarantee").text("Bs " + gar);
    // Layout visual: .animate() resalta el monto total
    $({ v: totalPrevio }).stop(true).animate({ v: total }, {
      duration: 400,
      step: function (n) { $("#total").text("Bs " + Math.round(n)); },
      complete: function () { $("#total").text("Bs " + total); }
    });
    $("#total").addClass("resumen__monto--resaltado");
    setTimeout(function () { $("#total").removeClass("resumen__monto--resaltado"); }, 450);
    totalPrevio = total;
  }
  function poblarCanchasReserva() {
    var $s = $("#canchaReserva").empty();
    canchas.filter(function (c) { return c.deporte === deporte; }).forEach(function (c) {
      $s.append($("<option>").val(c.id).text(c.titulo + " — Bs " + c.precio + "/h"));
    });
    $s.val(canchaId);
  }
  function elegirDeporte(d, id) {
    deporte = d;
    var primera = canchas.filter(function (c) { return c.deporte === d; })[0];
    canchaId = id || (primera ? primera.id : canchaId);
    $(".tipos__boton").removeClass("tipos__boton--elegido");
    $('.tipos__boton[data-deporte="' + d + '"]').addClass("tipos__boton--elegido");
    aplicarTema(d); poblarCanchasReserva(); pintarHorarios(); actualizar();
  }

  $(".tipos").off("click", ".tipos__boton").on("click", ".tipos__boton", function () {
    elegirDeporte($(this).data("deporte"));
    log("Seleccionó " + deporte);
  });
  $(".tarjeta-deporte__enlace").off("click").on("click", function () { elegirDeporte($(this).data("deporte")); });
  $("#canchaReserva").off("change").on("change", function () {
    canchaId = parseInt(this.value, 10); hora = ""; pintarHorarios(); actualizar();
    log("Cancha elegida: " + cancha(canchaId).titulo);
  });
  $("#fecha").off("change").on("change", function () {
    fecha = this.value || hoyISO(); hora = ""; pintarHorarios(); actualizar();
    log("Fecha seleccionada: " + fechaBonita(fecha));
  });
  $("#horarios").off("click", ".horarios__boton:not(:disabled)").on("click", ".horarios__boton:not(:disabled)", function () {
    hora = $(this).data("hora");
    $(".horarios__boton").removeClass("horarios__boton--elegido");
    $(this).addClass("horarios__boton--elegido");
    actualizar();
    log("Horario elegido: " + hora);
  });
  function fijarHoras(n) {
    horas = Math.max(1, Math.min(5, n || 1));
    $("#horas").val(horas);
    actualizar();
  }
  $("#horas").off("input change").on("input change", function () { fijarHoras(parseInt(this.value, 10)); });
  $("#minus").off("click").on("click", function () { fijarHoras(horas - 1); });
  $("#plus").off("click").on("click", function () { fijarHoras(horas + 1); });

  /* ---------- Modal con temporizador de 30 s ---------- */
  function cerrar() {
    clearInterval(timer); timer = null;
    $("#modal").fadeOut(180, function () { $(this).removeClass("modal--visible"); });
  }
  $("#confirm").off("click").on("click", function () {
    if (!fecha || !hora) { toast("Selecciona una fecha y un horario disponible."); return; }
    if (!bloqueLibre(canchaId, fecha, hora, horas)) { toast("Las " + horas + " horas seguidas no están libres. Prueba con otro horario."); return; }
    $("#mKind").text(cancha(canchaId).titulo);
    $("#mTime").text(fechaBonita(fecha) + " · " + hora + " · " + horas + " hora(s)");
    $("#mTotal").text($("#total").text());
    restante = 30; $("#timer").text("00:30");
    $("#modal").addClass("modal--visible").hide().fadeIn(180);
    clearInterval(timer);
    timer = setInterval(function () {
      restante--;
      $("#timer").text("00:" + String(Math.max(0, restante)).padStart(2, "0"));
      if (restante <= 0) { cerrar(); toast("Tarifa Flash Expirada. Vuelve a iniciar la confirmación."); log("Modal expiró"); }
    }, 1000);
    log("Abrió modal de confirmación");
  });
  $("#x, #cancel").off("click").on("click", function () { cerrar(); log("Canceló la confirmación"); });
  $("#modal").off("click.fondo").on("click.fondo", function (e) { if (e.target.id === "modal") { cerrar(); } });
  $(document).off("keydown.esc").on("keydown.esc", function (e) { if (e.key === "Escape" && timer) { cerrar(); } });

  function crearReserva(nombre, id, iso, h, cant) {
    var c = cancha(id), sub = c.precio * cant;
    var r = {
      id: Date.now() + Math.floor(Math.random() * 1000), nombre: nombre, canchaId: id, cancha: c.titulo,
      fecha: iso, hora: h, horas: cant, total: sub + sub * 0.5,
      estado: navigator.onLine ? "confirmada" : "pendiente"
    };
    var lista = leer(); lista.push(r); guardar(lista);
    return r;
  }
  $("#process").off("click").on("click", function () {
    cerrar();
    var r = crearReserva("Reserva web", canchaId, fecha, hora, horas);
    pintarReservas(); pintarHorarios(); hora = ""; actualizar(); poblarTurnos();
    toast(r.estado === "confirmada" ? "✓ Reserva registrada correctamente." : "Guardado localmente · Pendiente de envío");
    log("Reserva " + r.estado + ": " + r.cancha + ", " + fechaBonita(r.fecha) + " " + r.hora + ", Bs " + r.total);
  });

  /* ---------- Acordeón y bitácora ---------- */
  $(".acordeon").off("click", ".acordeon__boton").on("click", ".acordeon__boton", function () {
    var $panel = $(this).next();
    $(".acordeon__panel").not($panel).slideUp();
    $panel.slideToggle();
    $(".acordeon__boton b").text("＋");
    if ($panel.is(":visible") === false) { $(this).find("b").text("−"); }
    log("Consultó una pregunta frecuente");
  });
  $("#clear").off("click").on("click", function () { $("#logs").text("Bitácora limpiada."); });

  /* =========================================================
     CATÁLOGO ASÍNCRONO (Fetch API nativo + Lazy Loading)
     ========================================================= */
  function estado(msg) { return $("<p>").addClass("catalogo__estado").text(msg); }

  // Anti-XSS: cada dato del JSON entra con .text() / .attr(), nunca concatenado como HTML
  function tarjeta(c) {
    var $img = $("<img>").addClass("tarjeta-cancha__imagen")
      .attr({ src: c.portada, alt: "Cancha " + c.titulo, loading: "lazy", decoding: "async", width: 500, height: 300 });
    var $meta = $("<p>").addClass("tarjeta-cancha__meta").append(
      $("<span>").text(c.zona + " • " + c.jugadores + " jugadores • "),
      $("<b>").text("Bs " + c.precio + "/h")
    );
    var $info = $("<div>").addClass("tarjeta-cancha__info").append(
      $("<h4>").addClass("tarjeta-cancha__titulo").text(c.titulo).attr("title", c.titulo),
      $("<p>").addClass("tarjeta-cancha__detalle").text(c.detalle),
      $meta
    );
    var $acciones = $("<div>").addClass("tarjeta-cancha__acciones").append(
      $("<button>").attr("type", "button").addClass("tarjeta-cancha__boton tarjeta-cancha__boton--destacado").text("+ Reservar"),
      $("<button>").attr("type", "button").addClass("tarjeta-cancha__boton tarjeta-cancha__boton--detalle").text("Ver detalle")
    );
    return $("<article>").addClass("tarjeta-cancha").attr({ "data-id": c.id, "data-deporte": c.deporte }).append($img, $info, $acciones);
  }
  function pintarCatalogo() {
    var lista = canchas.filter(function (c) { return filtro === "todas" || c.deporte === filtro; });
    var $c = $("#catalogoCanchas").empty();
    if (!lista.length) { $c.append(estado("No hay canchas para este filtro.")); }
    lista.forEach(function (c) { $c.append(tarjeta(c)); });
    $("#conteoCatalogo").text("Mostrando " + lista.length + " de " + canchas.length);
  }
  function poblarTurnos() {
    // Reserva rápida: todas las canchas, y los horarios libres de hoy para la elegida
    var id = parseInt($("#canchaSelect").val(), 10) || canchas[0].id, hoy = hoyISO();
    var $t = $("#turnoSelect").empty();
    HORAS.forEach(function (h) {
      if (!ocupado(id, hoy, h)) { $t.append($("<option>").val(h).text(h + " hrs")); }
    });
    if (!$t.children().length) { $t.append($("<option>").val("").text("Sin horarios hoy")); }
  }
  function poblarSelectCanchas() {
    var $s = $("#canchaSelect").empty();
    canchas.forEach(function (c) { $s.append($("<option>").val(c.id).text(c.titulo + " — Bs " + c.precio + "/h")); });
    poblarTurnos();
  }
  function cargarCatalogo() {
    $("#catalogoCanchas").empty().append(estado("Cargando canchas…"));
    fetch("data/canchas.json")
      .then(function (res) {
        if (!res.ok) { throw new Error("Error al cargar el catálogo (" + res.status + ")"); }
        return res.json();
      })
      .then(function (datos) {
        canchas = datos;
        pintarCatalogo(); poblarSelectCanchas(); poblarCanchasReserva();
        pintarHorarios(); actualizar(); pintarReservas();
        log("Catálogo cargado: " + canchas.length + " canchas");
      })
      .catch(function (err) {
        console.error("Fallo en catálogo:", err);
        var $m = estado("No se pudo cargar el catálogo. Revisa tu conexión e inténtalo de nuevo. ");
        $m.append($("<button>").attr("type", "button").addClass("catalogo__reintentar").text("Reintentar"));
        $("#catalogoCanchas").empty().append($m);
        $("#conteoCatalogo").text("");
      });
  }
  // Delegación de eventos (.off().on()): un solo listener en el contenedor
  $("#catalogoCanchas").off("click", ".tarjeta-cancha__boton--destacado").on("click", ".tarjeta-cancha__boton--destacado", function () {
    var c = cancha($(this).closest(".tarjeta-cancha").data("id"));
    if (!c) { return; }
    elegirDeporte(c.deporte, c.id);
    toast(c.titulo + " seleccionada. Ahora elige fecha y horario.");
    log("Eligió desde el catálogo: " + c.titulo);
    location.hash = "reservar";
  });
  $("#catalogoCanchas").off("click", ".tarjeta-cancha__boton--detalle").on("click", ".tarjeta-cancha__boton--detalle", function () {
    var c = cancha($(this).closest(".tarjeta-cancha").data("id"));
    if (!c) { return; }
    $("#detalleTitulo").text(c.titulo);
    renderizarDetalleSeguro(c.descripcionHtml || "");
    $("#detalleCancha").removeAttr("hidden").hide().slideDown(200)[0].scrollIntoView({ behavior: "smooth", block: "nearest" });
    log("Vio el detalle de " + c.titulo);
  });
  $("#catalogoCanchas").off("click", ".catalogo__reintentar").on("click", ".catalogo__reintentar", cargarCatalogo);
  $("#filtrosCatalogo").off("click", ".filtros__chip").on("click", ".filtros__chip", function () {
    filtro = $(this).data("filtro");
    $(".filtros__chip").removeClass("filtros__chip--activo");
    $(this).addClass("filtros__chip--activo");
    pintarCatalogo();
    log("Filtró catálogo: " + filtro);
  });

  /* =========================================================
     MIS RESERVAS (anti-XSS + UI táctil + persistencia local)
     ========================================================= */
  function filaReserva(r) {
    var $estado = $("<em>").addClass("reserva-item__estado reserva-item__estado--" + r.estado)
      .text(r.estado === "confirmada" ? "Confirmada" : "Pendiente de envío");
    return $("<li>").addClass("reserva-item").attr("data-id", r.id).append(
      $("<strong>").addClass("reserva-item__nombre").text(r.nombre),
      $("<span>").addClass("reserva-item__detalle").text(r.cancha + " · " + fechaBonita(r.fecha) + " · " + r.hora + " (" + r.horas + " h) · Bs " + r.total),
      $estado,
      $("<button>").attr({ type: "button", "aria-label": "Quitar reserva" }).addClass("boton-tactil boton-tactil--quitar").text("X")
    );
  }
  function pintarReservas() {
    var lista = leer(), $ul = $("#listaReservas").empty();
    lista.forEach(function (r) { $ul.append(filaReserva(r)); });
    $("#reservasVacio").prop("hidden", lista.length > 0);
    $("#btnLimpiarReservas").prop("hidden", !lista.some(function (r) { return r.estado === "confirmada"; }));
  }
  $("#canchaSelect").off("change").on("change", poblarTurnos);
  $("#formReserva").off("submit").on("submit", function (e) {
    e.preventDefault();
    var nombre = $("#clienteNombre").val().trim(), id = parseInt($("#canchaSelect").val(), 10), turno = $("#turnoSelect").val();
    $("#errorReserva").prop("hidden", !!nombre);
    if (!nombre || !turno) { return; }
    var r = crearReserva(nombre, id, hoyISO(), turno, 1); // nombre entra con .text(): sin XSS
    this.reset(); poblarSelectCanchas(); pintarReservas(); pintarHorarios();
    log("Turno registrado: " + r.nombre + ", " + r.cancha + ", " + r.hora);
    toast(r.estado === "confirmada" ? "✓ Turno registrado." : "Guardado localmente · Pendiente de envío");
  });
  $("#btnLimpiarReservas").off("click").on("click", function () {
    var lista = leer(), quedan = lista.filter(function (r) { return r.estado !== "confirmada"; });
    guardar(quedan); pintarReservas(); pintarHorarios(); poblarTurnos();
    toast("Reservas confirmadas eliminadas.");
    log("Limpió " + (lista.length - quedan.length) + " reservas confirmadas");
  });

  function anotarEquipo() {
    var tema = $("#inputEquipo").val().trim();
    if (!tema) { return; }
    var $fila = $("<div>").addClass("espera-item");
    $fila.append(
      $("<span>").addClass("espera-item__nombre").text(tema).attr("title", tema),
      $("<button>").attr({ type: "button", "aria-label": "Quitar de la lista" }).addClass("boton-tactil boton-tactil--quitar").text("X")
    );
    $("#listaEspera").append($fila);
    $("#inputEquipo").val("");
    log("Anotado en lista de espera: " + tema);
  }
  $("#btnAnotar").off("click").on("click", anotarEquipo);
  $("#inputEquipo").off("keydown").on("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); anotarEquipo(); } });

  // Event Bubbling: un solo listener elimina filas dinámicas sin fugas de memoria
  $(".modulos").off("click", ".boton-tactil--quitar").on("click", ".boton-tactil--quitar", function () {
    var $fila = $(this).closest(".reserva-item, .espera-item");
    if ($fila.hasClass("reserva-item")) {
      var id = $fila.data("id");
      guardar(leer().filter(function (r) { return r.id !== id; }));
      $fila.remove(); pintarReservas(); pintarHorarios(); poblarTurnos();
    } else { $fila.remove(); }
    log("Quitó un elemento de la lista");
  });

  /* ---------- Inicio ---------- */
  fecha = hoyISO();
  $("#fecha").attr("min", fecha).val(fecha);
  pagina();
  actualizarEstadoRed();
  cargarCatalogo();
  $("body").attr("data-hidratado", "true");

  /* ---------- PWA: Service Worker (proxy invisible) ---------- */
  function registrarSW() {
    navigator.serviceWorker.register("./sw.js")
      .then(function (reg) { console.log("SW activo en alcance:", reg.scope); })
      .catch(function (err) { console.error("Error SW:", err); });
  }
  if ("serviceWorker" in navigator) {
    if (document.readyState === "complete") { registrarSW(); } else { window.addEventListener("load", registrarSW); }
  }
  log("Sesión iniciada en DeporZone");
});
