// fase 3: registro de eventos con datatables (punto 4)
// con tantos eventos una lista normal ya no servia
(function ($, Panel) {
  'use strict';

  const MAX_FILAS = 500;
  const COLOR_TIPO = { INFO: 'text-bg-secondary', NAV: 'text-bg-primary', AVISO: 'text-bg-warning', ERROR: 'text-bg-danger' };

  function hora(d) {
    return d.toLocaleTimeString('es-MX', { hour12: false });
  }

  $(function () {
    const $tabla = $('#tabla-registro');

    // quitar las filas de ejemplo de la version estatica
    $tabla.find('tbody').empty();

    const tabla = $tabla.DataTable({
      order: [[0, 'desc']],
      pageLength: 10,
      lengthMenu: [10, 25, 50],
      autoWidth: false,
      columns: [{ width: '6rem' }, { width: '5.5rem' }, { width: '7.5rem' }, null],
      layout: {
        topStart: null,
        topEnd: null,
        bottomStart: 'info',
        bottomEnd: 'paging'
      },
      language: {
        info: 'Mostrando _START_–_END_ de _TOTAL_ eventos',
        infoEmpty: 'Sin eventos que mostrar',
        infoFiltered: '(filtrados de _MAX_)',
        emptyTable: 'Todavía no hay eventos',
        zeroRecords: 'Ningún evento coincide con el filtro',
        paginate: { first: '«', last: '»', next: '›', previous: '‹' }
      }
    });

    const filas = []; // para borrar los mas viejos

    // armar la fila con $('<tr>')
    function crearFila(evt) {
      const $tr = $('<tr>');
      $('<td>').attr('data-order', evt.t.getTime()).text(hora(evt.t)).appendTo($tr);
      $('<td>').attr('data-search', evt.tipo)
        .append($('<span>').addClass('badge ' + COLOR_TIPO[evt.tipo]).text(evt.tipo))
        .appendTo($tr);
      $('<td>').text(evt.fuente).appendTo($tr);
      $('<td>').text(evt.mensaje).toggleClass('text-danger', evt.tipo === 'ERROR').appendTo($tr);
      return $tr;
    }

    function actualizarTotal() {
      const n = tabla.rows().count();
      $('#reg-total').text(n + (n === 1 ? ' evento' : ' eventos'));
    }

    function agregar(evt) {
      const $tr = crearFila(evt);
      tabla.row.add($tr[0]).draw(false);
      filas.push($tr[0]);

      if (filas.length > MAX_FILAS) {
        tabla.row(filas.shift()).remove().draw(false);
      }

      // resaltar la fila nueva un momento
      $tr.addClass('table-info');
      setTimeout(function () { $tr.removeClass('table-info'); }, 1200);

      if (evt.tipo === 'ERROR') Panel.toast(evt.fuente + ': ' + evt.mensaje, 'error');
      actualizarTotal();
    }

    // filtro por tipo con los checkbox marcados
    function filtrarTipos() {
      const tipos = $('.filtro-tipo:checked').map(function () { return $(this).val(); }).get();
      const patron = tipos.length ? '^(' + tipos.join('|') + ')$' : '^$';
      tabla.column(1).search(patron, true, false).draw();
      $('.filtro-tipo').each(function () {
        $(this).parent().toggleClass('opacity-50', !this.checked);
      });
    }
    $('.filtro-tipo').on('change', filtrarTipos);

    // buscador
    $('#buscar-registro').on('keyup search', function () {
      tabla.search($(this).val()).draw();
    });

    $('#btn-limpiar').on('click', function () {
      tabla.clear().draw();
      filas.length = 0;
      actualizarTotal();
      Panel.toast('Registro limpiado', 'info');
    });

    // meter los eventos que llegaron antes de que cargara la tabla
    Panel._sumidero = agregar;
    $.each(Panel._cola.splice(0), function (_, evt) { agregar(evt); });
    actualizarTotal();
  });
})(jQuery, window.Panel);
