/* Fase 1 — Carga de jQuery y función factoría $()
   Si jQuery cargó desde el CDN, $ es una función y $.fn.jquery trae la versión. */
$(function () {
  $('#ver-jquery').text($.fn.jquery);
});
