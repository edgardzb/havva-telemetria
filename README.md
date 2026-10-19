# Havva Telemetría

Panel web de telemetría para **Havva**, el robot de servicio del equipo de RoboCup @Home Beginners de la Universidad de Montemorelos. Proyecto de la Unidad 2 de *Técnicas para el Desarrollo de Frontend* (ISC, 3er semestre): un sitio Bootstrap al que se le agrega interactividad con **jQuery**.

Opción elegida: **A — Panel de telemetría** con datos simulados.

## Qué hace

| Zona | Qué puede hacer el usuario |
| --- | --- |
| Estado y batería | Ver en vivo el estado del robot, su odometría y la batería; aparece una alerta al bajar del umbral con un botón para mandarlo a la base. |
| Sensores | Seis lecturas que cambian cada segundo, con gráfica de tendencia y colores por estado (normal, atención, crítico). Al pasar el cursor muestran mínimo, máximo y promedio. |
| Tarjetas | Fijar una tarjeta arriba (se clona), colapsarla, ocultarla y reordenarlas arrastrando. El orden se recuerda en el navegador. |
| Actuadores | Encender o apagar cada motor, cambiar el modo de navegación, ajustar la velocidad máxima y activar el paro de emergencia. |
| Umbrales | Formulario con validación en vivo para la distancia mínima, la temperatura máxima y la batería de aviso. |
| Registro | Tabla de eventos con DataTables: orden, paginación, filtro por tipo y búsqueda libre. |

## Cómo correrlo

No necesita instalar nada. Hay dos formas:

- En VS Code, con la extensión **Live Server**: abre `index.html` y da clic en **Go Live** (barra de abajo).
- O abre `index.html` con doble clic en el navegador.

Necesita internet porque Bootstrap, jQuery y los plugins se cargan por CDN.

## Estructura

```
index.html          Estructura Bootstrap (base estática) y carga de librerías por CDN
css/estilos.css     Lo poco que Bootstrap no trae (gráficas de sensores, arrastre, tabla)
js/inicio.js        Fase 1: comprobación de jQuery y función factoría $()
js/simulador.js     Fuente de datos simulada (JavaScript puro, sin jQuery)
js/panel.js         Fase 2: sensores en vivo, batería, estado y actuadores
js/registro.js      Fase 3: registro de eventos con DataTables
js/tarjetas.js      Fase 3: tarjetas configurables, jQuery UI Sortable, umbrales, toasts
```

Cada `<script>` en `index.html` tiene un atributo `data-fase` que indica en qué fase se agregó.

## Librerías

| Librería | Versión | Para qué |
| --- | --- | --- |
| Bootstrap | 5.3.3 | Toda la interfaz: navbar, cards, alerts, badges, progress, forms, table, toasts y rejilla |
| jQuery | 3.7.1 | Selectores, eventos, efectos y manipulación del DOM |
| DataTables (+ integración Bootstrap 5) | 2.1.8 | Registro de eventos con orden, paginación y búsqueda |
| jQuery UI (Sortable) | 1.13.3 | Reordenar tarjetas arrastrando |

## Dónde está cada requisito de la rúbrica

| Requisito | Dónde |
| --- | --- |
| 5 tipos de selectores | `#id` (`$('#bat-barra')`), `.clase` (`$('.filtro-tipo')`), elemento (`$('body')`), atributo (`$('[data-sensor="lidar"]')`), pseudo (`$('#controles :input')`, `:checked`, `:hidden`, `option:selected`) |
| `.css()` y clases | `.css('opacity', 0.55)` atenúa las tarjetas al pausar los datos; `.css('display')` para saber qué tarjetas están ocultas; `.addClass/.removeClass` con clases de Bootstrap (`text-bg-*`, `border-*`, `bg-*`) según el estado; `.toggleClass('border-danger')` en el paro |
| Métodos | `.text()`, `.html()`, `.val()`, `.attr()`, `.prop()`, `.data()`, `.append()`, `.empty()`, `.remove()`, `.hide()`, `.toggle()` |
| Eventos | `click`, `change`, `input`, `keyup`, `submit`, `hover`, `mouseenter/mouseleave`, `focusin/focusout`, evento propio `telemetria` |
| Efectos | `fadeIn`, `fadeOut`, `slideUp`, `slideDown`, `animate` (barra de batería), `delay` (toasts) |
| DOM avanzado | `$('<tr>')`, `$('<div>')`, `.clone()`, `.insertBefore()`, `.after()`, `.appendTo()`, `.closest()`, `.find()`, `.children()`, `.siblings()`, `.parent()`, `.next()` |
| Plugins | DataTables (registro) y jQuery UI Sortable (orden de tarjetas) |

## Conectar datos reales

`simulador.js` es la única fuente de datos. Para usar un ESP32 o un puente `rosbridge`, basta con que envíe JSON con la misma forma que `paquete()` y llamar en la consola:

```js
HavvaSim.conectarWebSocket('ws://192.168.4.1:81');
```

Forma mínima del paquete:

```json
{
  "estado": "navegando", "modo": "autonomo", "paro": false,
  "motores": { "izq": true, "der": true },
  "bateria": 64.2, "voltaje": 23.7, "cargando": false, "autonomiaMin": 38,
  "sensores": { "lidar": 1.2, "ultra": 110, "vel": 0.31, "temp-izq": 44.0, "temp-der": 46.1, "cpu": 61.5 },
  "pose": { "x": 1.4, "y": -0.6, "theta": 87 },
  "eventos": [{ "tipo": "NAV", "fuente": "Navegación", "mensaje": "Waypoint alcanzado: cocina" }]
}
```

## Publicación

El sitio es estático. Para publicarlo en GitHub Pages: *Settings → Pages → Deploy from a branch*, rama `unidad-2` (o `main`), carpeta raíz.

## Uso de IA

Este proyecto se desarrolló con asistencia de Claude (Anthropic). Ver la declaración completa en el documento de decisiones técnicas.
