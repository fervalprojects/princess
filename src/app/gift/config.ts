// ✏️ Cambia aquí los textos de la sorpresa.
export const GIFT_CONFIG = {
  /** Texto que gira alrededor del ramo */
  ringText: "TE QUIERO 3 MILLONES",

  /** Carta que aparece al tocar el sobre */
  letter: {
    title: "Feliz día a mi princesa, Keyla",
    paragraphs: [
      "Espero que tu día sea tan bonito como tu sonrisa y tan increíble como las miraditas que solías darnos. Quiero que sepas Key que te pienso a cada momento de mi día y que muero de ganas por verte y poder decirte lo mucho que te quiero en persona. ❤️",
    ],
    quote: "«Estaré esperando con ansias que llegue ese día ❤️»",
  },

  /**
   * Música opcional: el archivo está en /public/musica.mp3 y suena al abrir la caja.
   * Si el archivo no existe, la página funciona igual sin sonido.
   */
  music: "/musica.mp3",
  /** Segundo de la canción desde el que empieza a sonar (0 = desde el inicio) */
  musicStart: 0,

  hints: {
    idle: "Toca la caja :3 🎁",
    open: "Toca el sobre :3 💌",
  },
} as const;
