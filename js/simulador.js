// simulador de datos del robot (js normal, sin jquery)
// manda un paquete cada segundo como si fuera havva o un esp32.
// la bateria baja mas rapido de lo normal para que se vean las alertas
const HavvaSim = (function () {
  'use strict';

  const PERIODO_MS = 1000;
  const WAYPOINTS = ['cocina', 'sala', 'comedor', 'recámara', 'entrada'];

  const s = {
    bateria: 24.0,
    modo: 'autonomo',      // autonomo | manual | base
    motorIzq: true,
    motorDer: true,
    paro: false,
    velMax: 0.5,           // m/s
    vel: 0.32,             // m/s
    x: 0, y: 0, thetaDeg: 0,
    lidar: 1.84,           // m
    ultra: 118,            // cm
    tempIzq: 41.5,         // °C
    tempDer: 43.0,         // °C
    cpu: 57,               // °C
    distUmbral: 0.45,      // m, se cambia desde el form de umbrales
    enBase: false,
    ticksBase: 0,
    obstaculo: 0,
    wp: 0,
    avisoObstaculo: false,
    llena: false
  };

  const oyentes = [];
  let pendientes = [];
  let timer = null;
  let pausado = false;
  let fuente = 'simulacion';

  const ruido = (a) => (Math.random() * 2 - 1) * a;
  const limitar = (v, a, b) => Math.min(b, Math.max(a, v));
  const consumoPorTick = () => 0.008 + 0.12 * (s.vel / 0.5);

  function evento(tipo, origen, mensaje) {
    pendientes.push({ tipo, fuente: origen, mensaje });
  }

  function calcularEstado() {
    if (s.paro) return 'paro';
    if (s.enBase) return s.bateria >= 99.5 ? 'cargada' : 'cargando';
    if (!s.motorIzq && !s.motorDer) return 'motores';
    if (s.motorIzq !== s.motorDer) return 'un-motor';
    if (s.modo === 'base') return 'base';
    if (s.modo === 'manual') return 'manual';
    return 'navegando';
  }

  function tick() {
    const motoresOk = s.motorIzq && s.motorDer;

    // velocidad segun el modo
    let objetivo = 0;
    if (!s.paro && motoresOk && !s.enBase) {
      if (s.modo === 'autonomo') objetivo = s.velMax * (0.75 + Math.random() * 0.25);
      else if (s.modo === 'base') objetivo = s.velMax * 0.8;
      // en manual se queda quieto
    }

    // lidar: de vez en cuando aparece un obstaculo
    if (s.obstaculo > 0) {
      s.obstaculo--;
      s.lidar = limitar(s.lidar + ruido(0.06), 0.22, 0.9);
    } else {
      s.lidar = limitar(s.lidar + (2.0 - s.lidar) * 0.15 + ruido(0.12), 0.6, 4.5);
      if (s.modo !== 'manual' && s.vel > 0.05 && Math.random() < 0.07) {
        s.obstaculo = 3 + Math.floor(Math.random() * 4);
        s.lidar = 0.28 + Math.random() * 0.4;
      }
    }
    if (s.lidar < s.distUmbral && objetivo > 0) {
      objetivo *= 0.15;
      if (!s.avisoObstaculo) {
        evento('NAV', 'Navegación', `Obstáculo a ${s.lidar.toFixed(2)} m al frente: velocidad reducida`);
        s.avisoObstaculo = true;
      }
    } else if (s.lidar >= s.distUmbral * 1.3) {
      s.avisoObstaculo = false;
    }

    // acelera y frena poco a poco
    s.vel += (objetivo - s.vel) * 0.45;
    if (s.vel < 0.005) s.vel = 0;

    // odometria
    if (s.vel > 0) {
      s.thetaDeg = (s.thetaDeg + ruido(9) + 360) % 360;
      const r = s.thetaDeg * Math.PI / 180;
      s.x += s.vel * Math.cos(r) * PERIODO_MS / 1000;
      s.y += s.vel * Math.sin(r) * PERIODO_MS / 1000;
    } else if (!s.paro && s.motorIzq !== s.motorDer) {
      s.thetaDeg = (s.thetaDeg + (s.motorIzq ? 6 : -6) + 360) % 360; // gira en su lugar
    }

    // ultrasonico
    s.ultra = limitar(s.ultra + ruido(6) + (120 - s.ultra) * 0.1, 25, 300);

    // temperaturas (suben si el motor trabaja)
    const cargaIzq = s.motorIzq && !s.paro ? s.vel / 0.8 : 0;
    const cargaDer = s.motorDer && !s.paro ? s.vel / 0.8 : 0;
    s.tempIzq += (32 + 30 * cargaIzq - s.tempIzq) * 0.08 + ruido(0.3);
    s.tempDer += (33 + 36 * cargaDer - s.tempDer) * 0.08 + ruido(0.3); // el derecho se calienta un poco mas
    const cpuObjetivo = 50 + (s.modo === 'autonomo' && s.vel > 0 ? 18 : 4);
    s.cpu += (cpuObjetivo - s.cpu) * 0.1 + ruido(0.8);

    // bateria
    if (s.enBase) {
      s.bateria = Math.min(100, s.bateria + 0.8);
      if (s.bateria >= 100 && !s.llena) {
        evento('INFO', 'Energía', 'Batería al 100%: Havva listo para operar');
        s.llena = true;
      }
    } else {
      s.bateria = Math.max(0, s.bateria - consumoPorTick());
    }

    // llega a la base despues de unos segundos
    if (s.modo === 'base' && !s.enBase && s.vel > 0.05) {
      s.ticksBase++;
      if (s.ticksBase >= 10) {
        s.enBase = true;
        s.vel = 0;
        evento('NAV', 'Navegación', 'Havva llegó a la base de carga');
        evento('INFO', 'Energía', 'Carga iniciada');
      }
    }

    // eventos random
    if (s.modo === 'autonomo' && s.vel > 0.1 && Math.random() < 0.07) {
      s.wp = (s.wp + 1) % WAYPOINTS.length;
      evento('NAV', 'Navegación', `Waypoint alcanzado: ${WAYPOINTS[s.wp]}`);
    }
    if (Math.random() < 0.03) {
      evento('INFO', 'SLAM', `Mapa actualizado: ${180 + Math.floor(Math.random() * 60)} celdas nuevas`);
    }
    if (Math.random() < 0.012) {
      evento('ERROR', 'IMU', 'Lectura de IMU fuera de rango: se descartó el paquete');
    }

    emitir();
  }

  function paquete() {
    return {
      t: Date.now(),
      fuente,
      estado: calcularEstado(),
      modo: s.modo,
      paro: s.paro,
      motores: { izq: s.motorIzq, der: s.motorDer },
      bateria: s.bateria,
      voltaje: 21.0 + 4.2 * s.bateria / 100,
      cargando: s.enBase && s.bateria < 100,
      autonomiaMin: s.enBase ? null : Math.max(0, Math.round(s.bateria / (0.008 + 0.12 * Math.max(s.vel, 0.25) / 0.5) / 60)),
      velMax: s.velMax,
      sensores: {
        lidar: s.lidar,
        ultra: s.ultra,
        vel: s.vel,
        'temp-izq': s.tempIzq,
        'temp-der': s.tempDer,
        cpu: s.cpu
      },
      pose: { x: s.x, y: s.y, theta: s.thetaDeg },
      eventos: pendientes.splice(0)
    };
  }

  function emitir(p) {
    const datos = p || paquete();
    oyentes.forEach((fn) => {
      try { fn(datos); } catch (e) { console.error('Error en un oyente de telemetría:', e); }
    });
  }

  function comando(c) {
    switch (c.tipo) {
      case 'motor':
        if (c.lado === 'izq') s.motorIzq = !!c.encendido; else s.motorDer = !!c.encendido;
        if (s.motorIzq !== s.motorDer) evento('AVISO', 'Motores', 'Un solo motor activo: Havva solo puede girar en su lugar');
        else if (!s.motorIzq && !s.motorDer) evento('AVISO', 'Motores', 'Ambos motores apagados: el robot no se puede mover');
        break;
      case 'modo':
        s.modo = c.valor;
        s.llena = false;
        if (c.valor !== 'base') { s.enBase = false; s.ticksBase = 0; }
        if (c.valor === 'base' && !s.enBase) evento('NAV', 'Navegación', 'Calculando ruta a la base de carga');
        break;
      case 'velMax':
        s.velMax = c.valor;
        break;
      case 'paro':
        s.paro = true;
        s.vel = 0;
        break;
      case 'reanudar':
        s.paro = false;
        break;
      case 'umbrales':
        s.distUmbral = c.distancia;
        break;
    }
    emitir(); // para que el cambio se vea al instante
  }

  function iniciar() {
    if (timer) return;
    pausado = false;
    emitir();
    timer = setInterval(tick, PERIODO_MS);
  }

  function pausar() {
    clearInterval(timer);
    timer = null;
    pausado = true;
  }

  // para conectar el robot real (esp32 o rosbridge) mandando el mismo json
  // ej: HavvaSim.conectarWebSocket('ws://192.168.4.1:81')
  function conectarWebSocket(url) {
    pausar();
    fuente = 'websocket';
    const ws = new WebSocket(url);
    ws.onmessage = (m) => {
      try {
        const p = JSON.parse(m.data);
        p.t = p.t || Date.now();
        p.eventos = p.eventos || [];
        emitir(p);
      } catch (e) {
        console.warn('Paquete inválido recibido por WebSocket', e);
      }
    };
    return ws;
  }

  return {
    iniciar,
    pausar,
    reanudar: iniciar,
    estaPausado: () => pausado,
    alRecibir: (fn) => oyentes.push(fn),
    comando,
    conectarWebSocket
  };
})();
