# Librería MATY – Sistema web (tienda física + tienda virtual)

Tecnología: React + TypeScript + Vite · Supabase (base de datos, usuarios, archivos) · Netlify (publicación).

## Lo que hay dentro
- `supabase/01_esquema.sql` → crea TODA la base de datos (se pega una sola vez).
- `supabase/02_administrador.sql` → convierte en administrador al usuario que tú crees.
- `src/` → el programa (tienda pública + panel administrativo).
- `netlify.toml` y `public/_redirects` → hacen que los enlaces internos funcionen al refrescar.

---
## PASO A PASO (sin tecnicismos)

### A. Supabase (la base de datos)
1. Entra a https://supabase.com, crea una cuenta y toca **New project**. Ponle nombre (ej. "libreria-maty"), inventa una contraseña de base de datos y elige la región más cercana. Espera 1–2 minutos.
2. **Crea tu usuario administrador:** menú **Authentication → Users → Add user → Create new user**. Escribe tu correo y una contraseña. Marca **Auto Confirm User**. Toca crear.
3. **Crea la base de datos:** menú **SQL Editor → New query**. Abre el archivo `supabase/01_esquema.sql`, copia TODO su contenido, pégalo y toca **Run**. Debe decir "Success".
4. **Vuélvete administrador:** abre `supabase/02_administrador.sql`, cambia `TU_CORREO@EJEMPLO.COM` por el correo del paso 2 (déjalo entre las comillas), pégalo en una consulta nueva y toca **Run**. Abajo debe aparecer tu correo con el rol `admin`.
5. **Carpetas de archivos (buckets):** el script del paso 3 ya las crea. Compruébalo en **Storage**: deben existir `product-images` (**Public**) y `payment-receipts` (**Private**). Si alguna faltara, créala con **New bucket** con ese nombre exacto y esa configuración, y vuelve a ejecutar el paso 3.
6. **Copia las dos claves:** menú **Project Settings → API** (o el botón **Connect**). Copia:
   - **Project URL**
   - **Publishable key** (también llamada *anon public key*). **Nunca uses la `service_role` / secret key.**
7. **Correos de confirmación:** menú **Authentication → Sign In / Providers → Email**. Si desactivas **Confirm email**, las cuentas de empleados que crees desde el sistema podrán ingresar de inmediato. Si lo dejas activado (más seguro), cada empleado deberá confirmar su correo antes de ingresar.

### B. Netlify (publicar la página)
1. Sube esta carpeta a un repositorio de GitHub (botón **Add file → Upload files** arrastrando todo el contenido; el archivo `.gitignore` evita subir claves).
2. En https://app.netlify.com toca **Add new site → Import an existing project → GitHub** y elige el repositorio. Netlify detecta solo los comandos (`npm run build`, carpeta `dist`).
3. Antes de publicar, abre **Site configuration → Environment variables** y crea estas DOS variables:
   - `VITE_SUPABASE_URL` = tu Project URL
   - `VITE_SUPABASE_ANON_KEY` = tu Publishable key
4. Toca **Deploy**. Cuando termine tendrás una dirección tipo `https://tu-sitio.netlify.app`.
5. **Vuelve a Supabase:** **Authentication → URL Configuration**. En **Site URL** pega la dirección de Netlify. En **Redirect URLs** agrega `https://tu-sitio.netlify.app/**`. (Sirve para que funcionen los correos de recuperar contraseña y confirmar cuenta.)
6. Si cambias las variables después, ve a **Deploys → Trigger deploy → Clear cache and deploy site**.

### C. Primeros pasos dentro del sistema
1. Entra a `/login` con tu correo de administrador. Te lleva al panel.
2. **Configuración:** escribe las instrucciones de pago, sube la imagen del QR, dirección y horario.
3. **Productos → Categorías** (ya hay algunas) y **Nuevo producto** (con foto, precio, costo y stock inicial).
4. **Usuarios → Crear cuenta de personal** para tus empleados (eliges si pueden manejar inventario y/o verificar pagos).
5. Haz una compra de prueba desde la tienda (en una ventana de incógnito) y recórrela: subir comprobante → Pagos → aprobar → Pedidos → preparar → entregar.

---
## Cómo se protege el stock (lo que debes saber)
- Al **crear un pedido en línea** se **reserva** el stock (por defecto 48 h, se cambia en Configuración). Nadie más puede comprar esas unidades.
- Si el cliente no paga a tiempo, la reserva se libera sola (se revisa cada vez que alguien entra a la tienda o al panel).
- Al **aprobar el pago**, la reserva pasa a ser una **salida real** de inventario. Subir un comprobante NUNCA confirma el pago.
- Las ventas en tienda descuentan al instante. Las anulaciones (solo administrador) devuelven el stock y quedan registradas.
- El stock no puede quedar negativo y nadie puede editarlo "a mano": solo cambia con ventas, pedidos, compras o ajustes con motivo.

## Límites reales (por no usar Edge Functions ni `service_role`)
- Desde el panel se pueden **crear** cuentas de empleados, **editar sus permisos**, **desactivarlas** y **enviarles el enlace para cambiar su clave**. **No** se puede borrar una cuenta de Authentication ni ver o cambiar contraseñas directamente: eso solo se hace en Supabase.
- Si una persona ya se registró como cliente con un correo, no se puede crear otra cuenta de personal con ese mismo correo: edita su rol en Usuarios.
- La pantalla de pedidos de invitados se protege con el **código del pedido** (largo e impredecible). Quien tenga el código puede ver ese pedido: compártelo solo con el cliente.
- Los **tickets son comprobantes internos**, no facturas fiscales. La facturación tributaria en Bolivia necesita una integración aparte.
- Los reportes calculan la ganancia con el **costo registrado** de cada producto. Si un producto no tiene costo, su ganancia sale inflada (el reporte te avisa). La **ganancia neta** solo es real si registras tus gastos.
- La compra recibida actualiza el costo del producto con **promedio ponderado**.
