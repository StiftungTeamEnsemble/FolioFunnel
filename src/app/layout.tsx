import '../styles/globals.css';
import '../styles/components/button.css';
import '../styles/components/input.css';
import '../styles/components/modal.css';
import '../styles/components/select.css';
import '../styles/components/table.css';
import '../styles/components/sidebar.css';
import '../styles/components/dropzone.css';
import '../styles/components/card.css';
import '../styles/components/toast.css';
import { Providers } from './providers';

export const metadata = {
  title: 'FolioFunnel - Document Processing',
  description: 'A document processing web app with knowledge table interface',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
