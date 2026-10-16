import type { Metadata } from 'next';
import './globals.css';
import {ClerkProvider} from '@clerk/nextjs';
import {AuthShell} from './auth-shell';
export const metadata: Metadata = { title:'TripSaathi · Your journey, together', description:'A connected workspace for trip disruption and recovery.' };
export default function Layout({children}:{children:React.ReactNode}){const content=<AuthShell>{children}</AuthShell>;return <html lang="en"><body>{process.env.NEXT_PUBLIC_AUTH_MODE==='demo'||!process.env.NEXT_PUBLIC_AUTH_MODE?content:<ClerkProvider publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}>{content}</ClerkProvider>}</body></html>;}
