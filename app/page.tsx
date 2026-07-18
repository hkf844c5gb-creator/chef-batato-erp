import { redirect } from 'next/navigation';

export default function Home() {
  // Redireciona imediatamente quem entra no site para a página de Login
  redirect('/login');
}