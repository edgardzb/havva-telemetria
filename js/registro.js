/* ==========================================================================
   Fase 3 — Punto 4 del mapa: registro de eventos con el plugin DataTables
   Problema real: en 5 minutos de operación el robot genera cientos de eventos.
   Una lista simple se vuelve inútil; DataTables da orden, paginación y búsqueda.
   ========================================================================== */
(function ($, Panel) {
  'use strict';

  const MAX_FILAS = 500;

  function hora(d) {
    return d.toLocaleTimeString('es-MX', { hour12: false });
  }

  $(function () {
    const $tabla = $('#tabla-registro');

    // Las filas fijas eran el «registro» estático de la versión anterior.
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

    const filas = []; // nodos en orden de llegada, para recortar los más viejos

    // Manipulación del DOM: cada evento se construye como elementos nuevos con $('<tr>').
    function crearFila(evt) {
      const tipo = evt.tipo;
      const $tr = $('<tr>').addClass('fila-' + tipo.toLowerCase());
      $('<td>').addClass('mono').attr('data-order', evt.t.getTime()).text(hora(evt.t)).appendTo($tr);
      $('<td>').attr('data-search', tipo)
        .append($('<span>').addClass('chip chip-' + tipo.toLowerCase()).text(tipo))
        .appendTo($tr);
      $('<td>').text(evt.fuente).appendTo($tr);
      $('<td>').text(evt.mensaje).appendTo($tr);
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

      $tr.addClass('recien');
      setTimeout(function () { $tr.removeClass('recien'); }, 60);

      if (evt.tipo === 'ERROR') Panel.toast(evt.fuente + ': ' + evt.mensaje, 'error');
      actualizarTotal();
    }

    // Filtro por tipo: los checkboxes marcados (:checked) arman una expresión regular.
    function filtrarTipos() {
      const tipos = $('.filtro-tipo:checked').map(function () { return $(this).val(); }).get();
      const patron = tipos.length ? '^(' + tipos.join('|') + ')$' : '^$';
      tabla.column(1).search(patron, true, false).draw();
      $('.filtro-tipo').each(function () {
        $(this).parent().toggleClass('inactivo', !this.checked);
      });
    }
    $('.filtro-tipo').on('change', filtrarTipos);

    // Búsqueda libre mientras escribes
    $('#buscar-registro').on('keyup search', function () {
      tabla.search($(this).val()).draw();
    });

    $('#btn-limpiar').on('click', function () {
      tabla.clear().draw();
      filas.length = 0;
      actualizarTotal();
      Panel.toast('Registro limpiado', 'info');
    });

    // Conectar el registro y vaciar la cola de eventos que llegaron antes
    Panel._sumidero = agregar;
    $.each(Panel._cola.splice(0), function (_, evt) { agregar(evt); });
    actualizarTotal();
  });
})(jQuery, window.Panel);
