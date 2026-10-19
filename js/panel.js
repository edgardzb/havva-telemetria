/* ==========================================================================
   Fase 2 — Puntos 1, 2 y 3 del mapa de interactividad
   1. Sensores en vivo   2. Batería y alerta   3. Control de actuadores
   ========================================================================== */
window.Panel = window.Panel || {};

(function ($, Panel) {
  'use strict';

  /* ---------- Estado compartido con los módulos de la Fase 3 ---------- */
  Panel.umbrales = { distancia: 0.45, temp: 70, bateria: 20 };
  Panel.ultimo = null;

  // El registro (registro.js) se conecta después; mientras tanto, los eventos esperan en una cola.
  Panel._cola = [];
  Panel._sumidero = null;
  Panel.registrar = function (tipo, fuente, mensaje) {
    const evt = { t: new Date(), tipo, fuente, mensaje };
    if (Panel._sumidero) Panel._sumidero(evt); else Panel._cola.push(evt);
  };
  Panel.toast = Panel.toast || function () {};

  const SENSORES = {
    lidar:      { unidad: 'm',   dec: 2, tipo: 'distancia' },
    ultra:      { unidad: 'cm',  dec: 0, tipo: 'distancia-cm' },
    vel:        { unidad: 'm/s', dec: 2, tipo: 'velocidad' },
    'temp-izq': { unidad: '°C',  dec: 1, tipo: 'temperatura', nombre: 'motor izquierdo' },
    'temp-der': { unidad: '°C',  dec: 1, tipo: 'temperatura', nombre: 'motor derecho' },
    cpu:        { unidad: '°C',  dec: 1, tipo: 'temperatura', nombre: 'CPU' }
  };
  const ETIQUETA = { ok: 'Normal', aviso: 'Atención', critico: 'Crítico' };
  const ESTADOS = {
    navegando: { texto: 'Navegando entre waypoints', chip: 'EN RUTA', clase: 'ok' },
    manual:    { texto: 'Esperando teleoperación', chip: 'MANUAL', clase: 'ok' },
    base:      { texto: 'Regresando a la base de carga', chip: 'A BASE', clase: 'aviso' },
    cargando:  { texto: 'En la base, cargando', chip: 'CARGANDO', clase: 'ok' },
    cargada:   { texto: 'En la base, batería completa', chip: 'LISTO', clase: 'ok' },
    'un-motor':{ texto: 'Un motor apagado: solo puede girar', chip: 'LIMITADO', clase: 'aviso' },
    motores:   { texto: 'Motores apagados', chip: 'DETENIDO', clase: 'aviso' },
    paro:      { texto: 'Paro de emergencia activo', chip: 'PARO', clase: 'critico' }
  };
  const MODOS = { autonomo: 'Autónomo', manual: 'Manual', base: 'Regreso a base' };
  const MAX_HIST = 30;

  const historial = {};
  const estadoPrevio = {};
  let ultimoT = Date.now();
  let alertaBateria = false;

  Panel.SENSORES = SENSORES;
  Panel.historial = historial;

  /* ---------- Utilidades ---------- */
  function evaluar(clave, v) {
    const u = Panel.umbrales;
    switch (SENSORES[clave].tipo) {
      case 'distancia':    return v < u.distancia ? 'critico' : v < u.distancia * 1.6 ? 'aviso' : 'ok';
      case 'distancia-cm': return v / 100 < u.distancia ? 'critico' : v / 100 < u.distancia * 1.6 ? 'aviso' : 'ok';
      case 'temperatura':  return v > u.temp ? 'critico' : v > u.temp - 8 ? 'aviso' : 'ok';
      default:             return 'ok';
    }
  }

  function puntosSpark(valores) {
    if (valores.length < 2) return '';
    let min = Math.min.apply(null, valores);
    let max = Math.max.apply(null, valores);
    if (max - min < 1e-6) { max += 0.5; min -= 0.5; }
    const paso = 120 / (MAX_HIST - 1);
    const desfase = (MAX_HIST - valores.length) * paso;
    return valores.map(function (v, i) {
      const x = desfase + i * paso;
      const y = 30 - ((v - min) / (max - min)) * 28;
      return x.toFixed(1) + ',' + y.toFixed(1);
    }).join(' ');
  }

  /* ---------- Punto 1: sensores en vivo ---------- */
  function pintarSensor(clave) {
    const cfg = SENSORES[clave];
    const hist = historial[clave] || [];
    if (!hist.length) return 'ok';
    const valor = hist[hist.length - 1];
    const estado = evaluar(clave, valor);

    // Selector de atributo: alcanza la tarjeta original y cualquier copia fijada.
    const $tarjetas = $('[data-sensor="' + clave + '"]');
    $tarjetas.removeClass('estado-ok estado-aviso estado-critico').addClass('estado-' + estado);
    $tarjetas.find('.valor').text(valor.toFixed(cfg.dec));
    $tarjetas.find('.ts-estado .chip').text(ETIQUETA[estado]);
    $tarjetas.find('polyline').attr('points', puntosSpark(hist));

    const min = Math.min.apply(null, hist);
    const max = Math.max.apply(null, hist);
    const prom = hist.reduce(function (a, b) { return a + b; }, 0) / hist.length;
    $tarjetas.find('.r-min').text(min.toFixed(cfg.dec));
    $tarjetas.find('.r-max').text(max.toFixed(cfg.dec));
    $tarjetas.find('.r-prom').text(prom.toFixed(cfg.dec));
    return estado;
  }
  Panel.refrescarSensor = pintarSensor;
  Panel.refrescarTodo = function () {
    $.each(SENSORES, function (clave) { pintarSensor(clave); });
    if (Panel.ultimo) pintarBateria(Panel.ultimo);
  };

  function actualizarSensores(p) {
    $.each(p.sensores, function (clave, valor) {
      if (!SENSORES[clave]) return;
      const hist = historial[clave] || (historial[clave] = []);
      hist.push(valor);
      if (hist.length > MAX_HIST) hist.shift();
      const estado = pintarSensor(clave);

      // Las temperaturas avisan al cruzar a «Crítico» (la distancia ya la reporta el robot).
      if (SENSORES[clave].tipo === 'temperatura' && estado === 'critico' && estadoPrevio[clave] !== 'critico') {
        Panel.registrar('AVISO', 'Temperatura', 'Temperatura del ' + SENSORES[clave].nombre + ' en ' + valor.toFixed(1) + ' °C (máximo ' + Panel.umbrales.temp + ' °C)');
      }
      estadoPrevio[clave] = estado;
    });
  }

  /* ---------- Punto 2: batería y alerta ---------- */
  function pintarBateria(p) {
    const pct = p.bateria;
    const u = Panel.umbrales.bateria;
    const clase = pct <= u ? 'critico' : pct <= u + 10 ? 'aviso' : 'ok';

    $('#bat-pct').text(Math.round(pct));
    $('#bat-barra').stop(true).animate({ width: pct + '%' }, 600);
    $('#bat-marca').css('left', u + '%');
    $('#tarjeta-bateria').removeClass('estado-ok estado-aviso estado-critico').addClass('estado-' + clase);
    $('#bat-voltaje').text(p.voltaje.toFixed(1) + ' V');
    $('#bat-autonomia').text(p.cargando ? 'Cargando' : p.autonomiaMin === null ? 'Completa' : '≈ ' + p.autonomiaMin + ' min');

    if (pct <= u && !p.cargando && !alertaBateria) {
      alertaBateria = true;
      $('#alerta-bat-pct').text(Math.round(pct));
      $('#alerta-bateria').stop(true, true).fadeIn(400);
      Panel.registrar('AVISO', 'Batería', 'Nivel bajo: ' + Math.round(pct) + '% (umbral ' + u + '%)');
    } else if ((pct > u + 2 || p.cargando) && alertaBateria) {
      alertaBateria = false;
      $('#alerta-bateria').stop(true, true).fadeOut(300);
    }
  }

  function pintarEstado(p) {
    const e = ESTADOS[p.estado] || ESTADOS.navegando;
    $('#txt-estado').text(e.texto);
    $('#chip-estado').text(e.chip).removeClass('chip-ok chip-aviso chip-critico').addClass('chip-' + e.clase);
    $('#estado-general').removeClass('estado-ok estado-aviso estado-critico').addClass('estado-' + e.clase);
    $('#txt-modo').text(MODOS[p.modo] || p.modo);
    $('#txt-motores').text('Izq ' + (p.motores.izq ? 'ON' : 'OFF') + ' · Der ' + (p.motores.der ? 'ON' : 'OFF'));
    $('#txt-pos').html(
      'x <b>' + p.pose.x.toFixed(2) + '</b> m · y <b>' + p.pose.y.toFixed(2) + '</b> m · θ <b>' + Math.round(p.pose.theta) + '</b>°'
    );
  }

  /* ---------- Punto 3: actuadores ---------- */
  function activarParo(activo) {
    HavvaSim.comando({ tipo: activo ? 'paro' : 'reanudar' });
    $('body').toggleClass('modo-paro', activo);
    // Pseudo-selector :input → todos los controles del panel, sin listarlos uno por uno.
    $('#controles :input').prop('disabled', activo);
    if (activo) {
      $('#banner-paro').stop(true, true).slideDown(250);
      $('#btn-reanudar').trigger('focus');
    } else {
      $('#banner-paro').stop(true, true).slideUp(200);
    }
    Panel.registrar(activo ? 'ERROR' : 'INFO', 'Operador', activo ? 'Paro de emergencia activado' : 'Operación reanudada tras paro de emergencia');
  }

  /* ---------- Arranque ---------- */
  $(function () {
    // Datos que llegan del robot (o del simulador)
    HavvaSim.alRecibir(function (p) {
      ultimoT = p.t;
      Panel.ultimo = p;
      actualizarSensores(p);
      pintarBateria(p);
      pintarEstado(p);
      $.each(p.eventos, function (_, e) { Panel.registrar(e.tipo, e.fuente, e.mensaje); });
      $(document).trigger('telemetria', [p]);
    });

    // Antigüedad del último paquete
    setInterval(function () {
      const seg = (Date.now() - ultimoT) / 1000;
      $('#txt-ultimo').text('hace ' + seg.toFixed(1) + ' s');
      if (!HavvaSim.estaPausado()) {
        const sinDatos = seg > 3;
        $('#pill-conexion').toggleClass('pill-ok', !sinDatos).toggleClass('pill-aviso', sinDatos);
        $('#txt-conexion').text(sinDatos ? 'Sin datos del robot' : 'Simulación acelerada · 1 Hz');
      }
    }, 200);

    // Pausar / reanudar la recepción de datos
    $('#btn-pausa').on('click', function () {
      const $btn = $(this);
      if (HavvaSim.estaPausado()) {
        HavvaSim.reanudar();
        $btn.text('Pausar datos');
        $('#pill-conexion').removeClass('pill-pausa').addClass('pill-ok');
        $('#txt-conexion').text('Simulación acelerada · 1 Hz');
        Panel.registrar('INFO', 'Panel', 'Recepción de datos reanudada');
      } else {
        HavvaSim.pausar();
        $btn.text('Reanudar datos');
        $('#pill-conexion').removeClass('pill-ok pill-aviso').addClass('pill-pausa');
        $('#txt-conexion').text('Datos en pausa');
        Panel.registrar('INFO', 'Panel', 'Recepción de datos en pausa');
      }
    });

    // Rango mín / máx / promedio al pasar el cursor (también con teclado).
    // Delegado: funciona para tarjetas que se agregan después (copias fijadas).
    $('#panel-sensores, #fijados-lista')
      .on('mouseenter focusin', '.tarjeta-sensor', function () {
        $(this).find('.rango').stop(true, true).slideDown(150);
      })
      .on('mouseleave focusout', '.tarjeta-sensor', function (e) {
        if (e.type === 'focusout' && $.contains(this, e.relatedTarget)) return;
        $(this).find('.rango').stop(true, true).slideUp(150);
      });

    // Interruptores de motores
    $('#controles').on('change', '.form-check-input', function () {
      const $sw = $(this);
      const lado = $sw.data('lado');
      const encendido = $sw.is(':checked');
      $sw.closest('.form-check').toggleClass('apagado', !encendido);
      $sw.siblings('label').find('.estado-sw').text(encendido ? 'ON' : 'OFF');
      Panel.registrar('INFO', 'Operador', 'Motor ' + (lado === 'izq' ? 'izquierdo' : 'derecho') + (encendido ? ' encendido' : ' apagado'));
      HavvaSim.comando({ tipo: 'motor', lado: lado, encendido: encendido });
    });

    // Modo de navegación
    $('#sel-modo').on('change', function () {
      const modo = $(this).val();
      Panel.registrar('NAV', 'Operador', 'Modo cambiado a: ' + $(this).find('option:selected').text());
      HavvaSim.comando({ tipo: 'modo', valor: modo });
    });

    // Velocidad máxima: el texto cambia mientras arrastras; el registro, al soltar
    $('#rng-vel')
      .on('input', function () {
        const v = parseFloat($(this).val());
        $('#txt-vel').text(v.toFixed(2) + ' m/s');
        HavvaSim.comando({ tipo: 'velMax', valor: v });
      })
      .on('change', function () {
        Panel.registrar('INFO', 'Operador', 'Velocidad máxima: ' + parseFloat($(this).val()).toFixed(2) + ' m/s');
      });

    // Paro de emergencia
    $('#btn-paro').hover(
      function () {
        $(this).addClass('armado');
        $('#txt-paro-ayuda').addClass('armada').text('Clic para detener a Havva de inmediato.');
      },
      function () {
        $(this).removeClass('armado');
        $('#txt-paro-ayuda').removeClass('armada').text('Corta la energía de ambos motores.');
      }
    );
    $('#btn-paro').on('click', function () { activarParo(true); });
    $('#btn-reanudar').on('click', function () { activarParo(false); });

    // Alerta de batería
    $('#btn-ir-base').on('click', function () {
      $('#sel-modo').val('base').trigger('change');
      $('#alerta-bateria').fadeOut(300);
    });
    $('#btn-cerrar-alerta').on('click', function () {
      $(this).closest('.banner').fadeOut(300);
    });

    HavvaSim.comando({ tipo: 'umbrales', distancia: Panel.umbrales.distancia });
    Panel.registrar('INFO', 'Panel', 'Panel conectado a la simulación de Havva (1 paquete por segundo)');
    HavvaSim.iniciar();
  });
})(jQuery, window.Panel);
