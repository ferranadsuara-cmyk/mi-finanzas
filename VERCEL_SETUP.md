# Activar el asistente financiero

El chat está integrado en `index.html` y el endpoint seguro está en `api/chat.js`.

## Despliegue

1. Importa este repositorio en Vercel: https://vercel.com/new
2. Mantén la configuración predeterminada para un proyecto estático con funciones Node.js. Vercel detecta automáticamente la carpeta `api`.
3. En el proyecto de Vercel, abre **Settings → Environment Variables**.
4. Crea la variable `OPENAI_API_KEY` con una clave API creada en https://platform.openai.com/api-keys.
5. Guarda la variable y vuelve a desplegar el proyecto (**Deployments → Redeploy**).
6. Abre la URL de Vercel. El chat llama a `/api/chat` desde el mismo dominio.

## Seguridad y datos

- La clave API solo se guarda como variable de entorno del servidor. Nunca la pegues en `index.html`, en GitHub ni en el chat de ChatGPT.
- Al usar el asistente, se envían a OpenAI el mensaje, el historial reciente de la conversación y los movimientos/objetivos guardados en el navegador para poder responder con contexto.
- Los datos financieros siguen guardándose en el almacenamiento local del navegador. El endpoint no los guarda en una base de datos propia.
- GitHub Pages no ejecuta funciones de servidor. Para que el chat funcione, hay que abrir la versión desplegada en Vercel.
- El uso de la API puede generar cargos en la cuenta de OpenAI Platform, independientes de una suscripción a ChatGPT.

El asistente usa la Responses API de OpenAI y el modelo `gpt-6-luna`. Si ese modelo no estuviera habilitado en el proyecto de API, cambia el valor de `model` en `api/chat.js` por otro modelo disponible en tu cuenta.
