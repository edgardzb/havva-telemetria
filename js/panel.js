// fase 2: sensores, bateria y controles (puntos 1, 2 y 3 del mapa)
window.Panel = window.Panel || {};

(function ($, Panel) {
  'use strict';

  // cosas que tambien usan registro.js y tarjetas.js
  Panel.umbrales = { distancia: 0.45, temp: 70, bateria: 20 };
  Panel.ultimo = null;

  // si el registro todavia no carga, los eventos se guardan en una cola
  Panel._cola = [];
  Panel._sumidero = null;
  Panel.registrar = function (tipo, fuente, mensaje) {
    const evt = { t: new Date(), tipo, fuente, mensaje };
    if (Panel._sumidero) Panel._sumidero(evt); else Panel._cola.push(evt);
  };
  Panel.toast = Panel.toast || function () {};

  const SENSORES = {
    lidar:      { dec: 2, tipo: 'distancia' },
    ultra:      { dec: 0, tipo: 'distancia-cm' },
    vel:        { dec: 2, tipo: 'velocidad' },
    'temp-izq': { dec: 1, tipo: 'temperatura', nombre: 'motor izquierdo' },
    'temp-der': { dec: 1, tipo: 'temperatura', nombre: 'motor derecho' },
    cpu:        { dec: 1, tipo: 'temperatura', nombre: 'CPU' }
  };
  const ETIQUETA = { ok: 'Normal', aviso: 'Atención', critico: 'Crítico' };

  // clases de bootstrap para cada estado
  const BADGE = { ok: 'text-bg-success', aviso: 'text-bg-warning', critico: 'text-bg-danger' };
  const BORDE = { ok: '', aviso: 'border-warning', critico: 'border-danger' };
  const TEXTO = { ok: 'text-primary', aviso: 'text-warning', critico: 'text-danger' };
  const BARRA = { ok: 'bg-success', aviso: 'bg-warning', critico: 'bg-danger' };

  const ESTADOS = {
    navegando: { texto: 'Navegando entre waypoints', chip: 'EN RUTA', clase: 'ok' },
    manual:    { texto: 'Esperando teleoperación', chip: 'MANUAL', clase: 'ok' },
    base:      { texto: 'Regresando a la base', chip: 'A BASE', clase: 'aviso' },
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

  // helpers
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

  function quitarClases(obj) {
    return $.map(obj, function (c) { return c; }).join(' ');
  }

  // punto 1: sensores
  function pintarSensor(clave) {
    const cfg = SENSORES[clave];
    const hist = historial[clave] || [];
    if (!hist.length) return 'ok';
    const valor = hist[hist.length - 1];
    const estado = evaluar(clave, valor);

    // con [data-sensor] agarro la tarjeta y tambien su copia si esta fijada
    const $tarjetas = $('[data-sensor="' + clave + '"]');
    $tarjetas.removeClass('estado-ok estado-aviso estado-critico').addClass('estado-' + estado);
    $tarjetas.find('.card').removeClass(quitarClases(BORDE)).addClass(BORDE[estado]);
    $tarjetas.find('.valor').text(valor.toFixed(cfg.dec));
    $tarjetas.find('.estado-badge').removeClass(quitarClases(BADGE)).addClass(BADGE[estado]).text(ETIQUETA[estado]);
    $tarjetas.find('.spark').removeClass(quitarClases(TEXTO)).addClass(TEXTO[estado]);
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

      // avisar cuando una temperatura pasa a critico
      if (SENSORES[clave].tipo === 'temperatura' && estado === 'critico' && estadoPrevio[clave] !== 'critico') {
        Panel.registrar('AVISO', 'Temperatura', 'Temperatura del ' + SENSORES[clave].nombre + ' en ' + valor.toFixed(1) + ' °C (máximo ' + Panel.umbrales.temp + ' °C)');
      }
      estadoPrevio[clave] = estado;
    });
  }

  // punto 2: bateria
  function pintarBateria(p) {
    const pct = p.bateria;
    const u = Panel.umbrales.bateria;
    const clase = pct <= u ? 'critico' : pct <= u + 10 ? 'aviso' : 'ok';

    $('#bat-pct').text(Math.round(pct))
      .parent().removeClass('text-warning text-danger')
      .addClass(clase === 'critico' ? 'text-danger' : clase === 'aviso' ? 'text-warning' : '');
    $('#bat-barra').removeClass(quitarClases(BARRA)).addClass(BARRA[clase])
      .stop(true).animate({ width: pct + '%' }, 600);
    $('#bat-umbral').text(u);
    $('#bat-voltaje').text(p.voltaje.toFixed(1) + ' V');
    $('#bat-autonomia').text(p.cargando ? 'cargando' : p.autonomiaMin === null ? 'completa' : '≈ ' + p.autonomiaMin + ' min');

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
    $('#chip-estado').text(e.chip).removeClass(quitarClases(BADGE)).addClass(BADGE[e.clase]);
    $('#estado-general').toggleClass('border-danger', e.clase === 'critico');
    $('#txt-modo').text(MODOS[p.modo] || p.modo);
    $('#txt-motores').text('Izq ' + (p.motores.izq ? 'ON' : 'OFF') + ' · Der ' + (p.motores.der ? 'ON' : 'OFF'));
    $('#txt-pos').html(
      'x <b>' + p.pose.x.toFixed(2) + '</b> m · y <b>' + p.pose.y.toFixed(2) + '</b> m · θ <b>' + Math.round(p.pose.theta) + '</b>°'
    );
  }

  // punto 3: controles
  function activarParo(activo) {
    HavvaSim.comando({ tipo: activo ? 'paro' : 'reanudar' });
    $('#controles').toggleClass('border-danger', activo);
    // :input agarra todos los controles de una vez
    $('#controles :input').prop('disabled', activo);
    if (activo) {
      $('#banner-paro').stop(true, true).slideDown(250);
      $('#btn-reanudar').trigger('focus');
    } else {
      $('#banner-paro').stop(true, true).slideUp(200);
    }
    Panel.registrar(activo ? 'ERROR' : 'INFO', 'Operador', activo ? 'Paro de emergencia activado' : 'Operación reanudada tras paro de emergencia');
  }

  // inicio
  $(function () {
    // cada vez que llega un paquete
    HavvaSim.alRecibir(function (p) {
      ultimoT = p.t;
      Panel.ultimo = p;
      actualizarSensores(p);
      pintarBateria(p);
      pintarEstado(p);
      $.each(p.eventos, function (_, e) { Panel.registrar(e.tipo, e.fuente, e.mensaje); });
      $(document).trigger('telemetria', [p]);
    });

    // cuanto tiempo lleva sin llegar un paquete
    setInterval(function () {
      const seg = (Date.now() - ultimoT) / 1000;
      $('#txt-ultimo').text('hace ' + seg.toFixed(1) + ' s');
      if (!HavvaSim.estaPausado()) {
        const sinDatos = seg > 3;
        $('#pill-conexion')
          .toggleClass('text-bg-success', !sinDatos)
          .toggleClass('text-bg-warning', sinDatos)
          .text(sinDatos ? 'Sin datos del robot' : 'Simulación · 1 Hz');
      }
    }, 200);

    // boton de pausa
    $('#btn-pausa').on('click', function () {
      const $btn = $(this);
      if (HavvaSim.estaPausado()) {
        HavvaSim.reanudar();
        $('#panel-sensores, #fijados-lista').css('opacity', '');
        $btn.text('Pausar datos');
        $('#pill-conexion').removeClass('text-bg-secondary').addClass('text-bg-success').text('Simulación · 1 Hz');
        Panel.registrar('INFO', 'Panel', 'Recepción de datos reanudada');
      } else {
        HavvaSim.pausar();
        // atenuar las tarjetas para que se note que los datos estan congelados
        $('#panel-sensores, #fijados-lista').css('opacity', 0.55);
        $btn.text('Reanudar datos');
        $('#pill-conexion').removeClass('text-bg-success text-bg-warning').addClass('text-bg-secondary').text('Datos en pausa');
        Panel.registrar('INFO', 'Panel', 'Recepción de datos en pausa');
      }
    });

    // min/max/prom con hover (delegado para que sirva en las copias)
    $('#panel-sensores, #fijados-lista')
      .on('mouseenter focusin', '.tarjeta-sensor', function () {
        $(this).find('.rango').stop(true, true).slideDown(150);
      })
      .on('mouseleave focusout', '.tarjeta-sensor', function (e) {
        if (e.type === 'focusout' && $.contains(this, e.relatedTarget)) return;
        $(this).find('.rango').stop(true, true).slideUp(150);
      });

    // switches de motores
    $('#controles').on('change', '.form-check-input', function () {
      const $sw = $(this);
      const lado = $sw.data('lado');
      const encendido = $sw.is(':checked');
      $sw.siblings('label').find('.estado-sw')
        .text(encendido ? 'ON' : 'OFF')
        .toggleClass('text-bg-success', encendido)
        .toggleClass('text-bg-secondary', !encendido);
      Panel.registrar('INFO', 'Operador', 'Motor ' + (lado === 'izq' ? 'izquierdo' : 'derecho') + (encendido ? ' encendido' : ' apagado'));
      HavvaSim.comando({ tipo: 'motor', lado: lado, encendido: encendido });
    });

    // modo
    $('#sel-modo').on('change', function () {
      const modo = $(this).val();
      Panel.registrar('NAV', 'Operador', 'Modo cambiado a: ' + $(this).find('option:selected').text());
      HavvaSim.comando({ tipo: 'modo', valor: modo });
    });

    // slider de velocidad (se registra al soltar)
    $('#rng-vel')
      .on('input', function () {
        const v = parseFloat($(this).val());
        $('#txt-vel').text(v.toFixed(2) + ' m/s');
        HavvaSim.comando({ tipo: 'velMax', valor: v });
      })
      .on('change', function () {
        Panel.registrar('INFO', 'Operador', 'Velocidad máxima: ' + parseFloat($(this).val()).toFixed(2) + ' m/s');
      });

    // paro
    $('#btn-paro').hover(
      function () {
        $('#txt-paro-ayuda').addClass('text-danger fw-semibold').text('Clic para detener a Havva de inmediato.');
      },
      function () {
        $('#txt-paro-ayuda').removeClass('text-danger fw-semibold').text('Corta la energía de ambos motores.');
      }
    );
    $('#btn-paro').on('click', function () { activarParo(true); });
    $('#btn-reanudar').on('click', function () { activarParo(false); });

    // banner de bateria
    $('#btn-ir-base').on('click', function () {
      $('#sel-modo').val('base').trigger('change');
      $('#alerta-bateria').fadeOut(300);
    });
    $('#btn-cerrar-alerta').on('click', function () {
      $('#alerta-bateria').fadeOut(300);
    });

    HavvaSim.comando({ tipo: 'umbrales', distancia: Panel.umbrales.distancia });
    Panel.registrar('INFO', 'Panel', 'Panel conectado a la simulación de Havva (1 paquete por segundo)');
    HavvaSim.iniciar();
  });
})(jQuery, window.Panel);
