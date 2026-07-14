export const metadata = {
  title: 'EndoDB',
  description: 'Base de datos de endoscopia',
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
