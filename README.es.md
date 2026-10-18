<p align="center">
  <a href="README.md">English</a> · <a href="README.pt-BR.md">Português</a> · <strong>Español</strong>
</p>

<p align="center">
  <img src="assets/icon.png" width="96" alt="Icono de Rift Companion" />
</p>

<h1 align="center">Rift Companion</h1>

<p align="center">
  Companion gratuito para League of Legends en PC: builds, runas, información de la partida en vivo e historial,<br />
  usando solo datos oficiales de Riot.
</p>

<p align="center">
  <img alt="Plataforma" src="https://img.shields.io/badge/plataforma-Windows%2010%2F11-0b0d12?style=flat-square" />
  <img alt="Estado" src="https://img.shields.io/badge/estado-beta%20cerrada-e84057?style=flat-square" />
  <img alt="Precio" src="https://img.shields.io/badge/precio-gratis-2fbf71?style=flat-square" />
  <img alt="Electron" src="https://img.shields.io/badge/Electron-Angular-4a7fd6?style=flat-square" />
</p>

<p align="center">
  <a href="https://rift-api.workscanner.com.br/downloads/RiftCompanion.exe"><img alt="Descargar" src="https://img.shields.io/badge/Descargar-Windows-e84057?style=for-the-badge&logo=data:image/svg%2bxml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLXdpZHRoPSIyLjQiPjxwYXRoIGQ9Ik0xMiAzVjE0LjVNNyAxMCAxMiAxNSAxNyAxME00IDE2LjVWMjAuNUgyMFYxNi41Ii8+PC9zdmc+" /></a>
</p>

<p align="center">
  <img src="docs/screenshots/live.png" alt="Partida en vivo" width="900" />
</p>

<p align="center"><sub>La interfaz del app está en portugués por ahora.</sub></p>

## Funciones

### Partida en vivo
Cuando empieza la partida, Rift Companion muestra los dos equipos con la división, el porcentaje de victorias, la maestría del campeón y el rendimiento reciente de cada jugador. También muestra una estimación simple de victoria según la división media de los equipos.

Además, te avisa **qué jugadores estuvieron en tus últimas 10 partidas** (en tu equipo o en contra), con los campeones, el KDA de cada uno y el resultado.

### Una build para cada partida
En la selección de campeones y en la partida en vivo, Rift Companion detecta tu **rival de línea** y el **perfil de daño del equipo enemigo** (mayoría mágico, mayoría físico o mixto). Después muestra la build del enfrentamiento y los objetos que los jugadores Maestro+ de tu campeón compran más contra ese tipo de equipo.

### Builds, runas y tier list
- Las páginas de runas, objetos iniciales, objetos principales, botas y orden de habilidades más usados para cada campeón y rol.
- Enfrentamientos: porcentaje de victorias contra cada rival de línea y builds para enfrentamientos específicos.
- Tier list por rol, actualizada continuamente en el parche actual.
- Las estadísticas salen de partidas clasificatorias Solo/Dúo de **jugadores Maestro+ de BR, EUW y KR**.

<p align="center">
  <img src="docs/screenshots/builds.png" alt="Builds y runas" width="440" />
  <img src="docs/screenshots/tierlist.png" alt="Tier list" width="440" />
</p>

### Selección de campeones
- Importa runas, hechizos de invocador y un set de objetos al cliente con un clic.
- Importación automática opcional al confirmar el campeón.
- Soporte para ARAM: intercambio con el banquillo y rerolls desde el app.

### Herramientas del cliente
- Aceptar partida automáticamente.
- Crear sala, elegir roles (incluidos los campeones de Swiftplay), invitar amigos y entrar en cola desde el app.
- Búsqueda de jugadores por Riot ID con división, maestría e historial completo de partidas.
- Barra opcional durante la partida (KDA, CS, oro y temporizadores de objetivos) usando la Live Client Data API.
- Icono en la bandeja del sistema, inicio con Windows y actualizaciones automáticas.

## Cómo funciona

```
┌──────────────────────────┐        ┌──────────────────────────┐        ┌───────────┐
│ Rift Companion (PC)      │ HTTPS  │ rift-api (nuestro        │ HTTPS  │ Riot API  │
│ Electron + Angular       ├───────►│ servidor): guarda la     ├───────►│           │
│                          │        │ clave, limita y cachea   │        └───────────┘
└──────┬────────────┬──────┘        └──────────────────────────┘
       │ API LCU    │ Live Client Data API
       ▼            ▼
  Cliente de LoL   Juego (127.0.0.1:2999, solo lectura)
```

- **API del cliente de LoL (LCU):** estado de la cuenta, sala, selección de campeones e importación de runas y objetos. Solo local.
- **Live Client Data API:** datos de la partida, solo lectura, para la barra durante el juego. Solo local.
- **Riot API** (account-v1, summoner-v4, league-v4, champion-mastery-v4, match-v5, spectator-v5): se accede **solo a través de nuestro servidor**. La clave de la API nunca se incluye en el app.

## Juego limpio y políticas de Riot

Rift Companion sigue las [políticas para desarrolladores](https://developer.riotgames.com/policies/general) de Riot y las normas de apps de terceros de League of Legends:

- **Sin inyección, lectura de memoria ni cambios en los archivos del juego.** La barra durante la partida es una ventana transparente aparte, que nunca toca el proceso del juego. Funciona con el juego en modo sin bordes.
- **Sin información oculta.** No muestra nada que el jugador no pueda ver en el cliente o en perfiles públicos: nada de temporizadores de la jungla enemiga ni información de la niebla de guerra.
- **Sin automatización del juego.** Solo comodidades del cliente que el propio jugador activa (aceptar partida, importar runas).
- **Clave protegida:** la clave de la Riot API está solo en el servidor. Las búsquedas de los usuarios tienen prioridad sobre la recolección de estadísticas, los límites se respetan por ruta y las respuestas se guardan en caché.

## Privacidad

Rift Companion no crea cuentas, no lee contraseñas y no recopila datos personales. Consulta [PRIVACY.md](PRIVACY.md) (en inglés).

## Desarrollo

Requisitos: Node.js 22+, Windows 10/11 y el cliente de League of Legends.

```bash
npm install
npm --prefix renderer install
npm start
```

| Comando | Qué hace |
| --- | --- |
| `npm run build` | Compila el proceso principal de Electron y la interfaz Angular |
| `npm test` | Ejecuta las pruebas |
| `npm run dist` | Genera el ejecutable portátil de Windows en `release/` |

Carpetas del proyecto:

- `electron/`: proceso principal (conexión con el cliente, selección de campeones, sala, overlay, actualizaciones)
- `renderer/`: interfaz Angular
- `server/`: `rift-api`, el proxy de la Riot API y el recolector de estadísticas
- `docs/ARQUITETURA.md`: notas técnicas (en portugués)

## Aviso legal

Rift Companion no está respaldado por Riot Games y no refleja las opiniones de Riot Games ni de ninguna persona oficialmente involucrada en la producción o gestión de las propiedades de Riot Games. Riot Games y todas las propiedades asociadas son marcas comerciales o marcas registradas de Riot Games, Inc.
