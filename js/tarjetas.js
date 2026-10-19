// fase 3: tarjetas (fijar, ocultar, ordenar) y form de umbrales (punto 5)
(function ($, Panel) {
  'use strict';

  const CLAVE_GUARDADO = 'havva-panel-v1';
  const COLOR_TOAST = { info: 'text-bg-dark', ok: 'text-bg-success', aviso: 'text-bg-warning', error: 'text-bg-danger' };

  // toasts (con fadeIn, delay y fadeOut de jquery)
  Panel.toast = function (texto, tipo) {
    const $t = $('<div>', { 'class': 'toast show border-0 ' + (COLOR_TOAST[tipo] || COLOR_TOAST.info), role: 'status' })
      .append($('<div>').addClass('toast-body').text(texto))
      .hide()
      .appendTo('#toasts');
    $t.fadeIn(200).delay(2800).fadeOut(400, function () { $(this).remove(); });
  };

  // guardar el orden en localStorage
  function guardarDisposicion() {
    const $tarjetas = $('#panel-sensores').children('.tarjeta-sensor');
    const datos = {
      orden: $tarjetas.map(function () { return $(this).data('sensor'); }).get(),
      colapsadas: $tarjetas.filter('.colapsada').map(function () { return $(this).data('sensor'); }).get(),
      ocultas: $tarjetas.filter(function () { return $(this).css('display') === 'none'; })
        .map(function () { return $(this).data('sensor'); }).get()
    };
    try { localStorage.setItem(CLAVE_GUARDADO, JSON.stringify(datos)); } catch (e) { /* si no hay localStorage no pasa nada */ }
  }

  function restaurarDisposicion() {
    let datos = null;
    try { datos = JSON.parse(localStorage.getItem(CLAVE_GUARDADO)); } catch (e) { datos = null; }
    if (!datos) return;
    const $panel = $('#panel-sensores');
    $.each(datos.orden || [], function (_, clave) {
      $panel.append($panel.children('[data-sensor="' + clave + '"]'));
    });
    $.each(datos.colapsadas || [], function (_, clave) {
      const $t = $panel.children('[data-sensor="' + clave + '"]');
      $t.addClass('colapsada').find('.card-body').hide();
      $t.find('.card').removeClass('h-100');
      $t.find('[data-accion="colapsar"]').text('+');
    });
    $.each(datos.ocultas || [], function (_, clave) {
      $panel.children('[data-sensor="' + clave + '"]').hide();
    });
  }

  function actualizarBotonRestaurar() {
    const n = $('#panel-sensores').children('.tarjeta-sensor').filter(function () {
      return $(this).css('display') === 'none';
    }).length;
    $('#btn-restaurar').toggle(n > 0).find('.n').text(n);
  }

  // validar umbrales
  function validar($in) {
    const v = parseFloat($in.val());
    const min = parseFloat($in.attr('min'));
    const max = parseFloat($in.attr('max'));
    const ok = !isNaN(v) && v >= min && v <= max;
    $in.toggleClass('is-invalid', !ok).toggleClass('is-valid', ok);

    // crear el mensaje de error si no existe
    let $msg = $in.next('.invalid-feedback');
    if (!$msg.length) {
      $msg = $('<div>').addClass('invalid-feedback');
      $in.after($msg);
    }
    $msg.text(isNaN(v) ? 'Escribe un número.' : 'Usa un valor entre ' + min + ' y ' + max + '.');
    return ok;
  }

  $(function () {
    restaurarDisposicion();
    actualizarBotonRestaurar();

    // ordenar arrastrando (jquery ui)
    $('#panel-sensores').sortable({
      items: '> .tarjeta-sensor',
      handle: '.card-header',
      cancel: 'button',
      placeholder: 'col tarjeta-hueco',
      forcePlaceholderSize: true,
      tolerance: 'pointer',
      update: function () {
        guardarDisposicion();
        Panel.registrar('INFO', 'Operador', 'Orden de tarjetas actualizado');
      }
    });

    // colapsar
    $(document).on('click', '#panel-sensores [data-accion="colapsar"]', function () {
      const $btn = $(this);
      const $tarjeta = $btn.closest('.tarjeta-sensor');
      $tarjeta.toggleClass('colapsada');
      const colapsada = $tarjeta.hasClass('colapsada');
      $tarjeta.find('.card').toggleClass('h-100', !colapsada);
      $tarjeta.find('.card-body').stop(true, true)[colapsada ? 'slideUp' : 'slideDown'](200);
      $btn.text(colapsada ? '+' : '−');
      guardarDisposicion();
    });

    // ocultar, o quitar si es una copia fijada
    $(document).on('click', '.tarjeta-sensor [data-accion="ocultar"]', function () {
      const $tarjeta = $(this).closest('.tarjeta-sensor');
      const nombre = $tarjeta.find('.ts-nombre').text();

      if ($tarjeta.hasClass('fijada')) {
        const clave = $tarjeta.data('sensor');
        $tarjeta.fadeOut(200, function () {
          $(this).remove();
          $('#panel-sensores').children('[data-sensor="' + clave + '"]')
            .find('[data-accion="fijar"]').prop('disabled', false).text('Fijar');
          if (!$('#fijados-lista').children().length) $('#zona-fijados').slideUp(200);
        });
        return;
      }

      $tarjeta.fadeOut(250, function () {
        actualizarBotonRestaurar();
        guardarDisposicion();
      });
      Panel.toast(nombre + ' oculto. Usa «Mostrar ocultas» para recuperarlo.', 'info');
    });

    $('#btn-restaurar').on('click', function () {
      $('#panel-sensores').children('.tarjeta-sensor:hidden').fadeIn(250, function () {
        actualizarBotonRestaurar();
        guardarDisposicion();
      });
    });

    // fijar: clonar la tarjeta y ponerla arriba
    $(document).on('click', '#panel-sensores [data-accion="fijar"]', function () {
      const $btn = $(this);
      const $original = $btn.closest('.tarjeta-sensor');
      const clave = $original.data('sensor');
      const $lista = $('#fijados-lista');

      const $copia = $original.clone();
      $copia.removeAttr('style').removeClass('colapsada ui-sortable-handle').addClass('fijada');
      $copia.find('.card').addClass('border-primary h-100');
      $copia.find('.card-body').removeAttr('style');
      $copia.find('.rango').hide();
      $copia.find('[data-accion="fijar"], [data-accion="colapsar"]').remove();

      $copia.hide();
      if ($lista.children().length) $copia.insertBefore($lista.children().first());
      else $copia.appendTo($lista);

      $('#zona-fijados').slideDown(200);
      $copia.fadeIn(300);
      Panel.refrescarSensor(clave);

      $btn.prop('disabled', true).text('Fijada');
      Panel.registrar('INFO', 'Operador', 'Tarjeta fijada: ' + $original.find('.ts-nombre').text());
    });

    // validar mientras escribe
    $('#form-umbrales').on('keyup input change', 'input', function () { validar($(this)); });

    $('#form-umbrales').on('submit', function (e) {
      e.preventDefault();
      const $form = $(this);
      let valido = true;
      $form.find('input').each(function () { if (!validar($(this))) valido = false; });

      if (!valido) {
        $form.find('.is-invalid').first().trigger('focus');
        Panel.toast('Revisa los campos marcados en rojo', 'aviso');
        return;
      }

      Panel.umbrales = {
        distancia: parseFloat($('#in-dist').val()),
        temp: parseFloat($('#in-temp').val()),
        bateria: parseFloat($('#in-bat').val())
      };
      HavvaSim.comando({ tipo: 'umbrales', distancia: Panel.umbrales.distancia });
      Panel.refrescarTodo();

      Panel.toast('Umbrales guardados', 'ok');
      Panel.registrar('INFO', 'Operador',
        'Umbrales: distancia ' + Panel.umbrales.distancia.toFixed(2) + ' m · temperatura ' +
        Panel.umbrales.temp + ' °C · batería ' + Panel.umbrales.bateria + ' %');

      setTimeout(function () { $form.find('.is-valid').removeClass('is-valid'); }, 1500);
    });
  });
})(jQuery, window.Panel);
