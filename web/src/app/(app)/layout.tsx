import Sidebar from '@/components/ui/Sidebar'
import Player from '@/components/player/Player'
import AdBanner from '@/components/ui/AdBanner'
import { createClient } from '@/lib/supabase/server'
import { LocaleProvider } from '@/lib/i18n/LocaleContext'
import { UserProvider } from '@/lib/auth/UserContext'
import AppToasts from '@/components/ui/AppToasts'
import { cookies } from 'next/headers'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()
  const sidebarCookie = cookieStore.get('sidebar-open')?.value
  const sidebarOpen = sidebarCookie === undefined ? true : sidebarCookie === 'true'

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let isFreeTier = true
  if (user) {
    const { data } = await supabase
      .from('user_profiles')
      .select('tier')
      .eq('user_id', user.id)
      .single()
    isFreeTier = !data || data.tier === 'free'
  }

  return (
    <UserProvider isGuest={!user} tier={isFreeTier ? 'free' : 'paid'}>
      <LocaleProvider>
        <div className="flex h-screen bg-background text-on-surface overflow-hidden">
          <Sidebar defaultOpen={sidebarOpen} />
          <div className="flex-1 flex flex-col overflow-hidden">
            {isFreeTier && <AdBanner />}
            <main className="flex-1 overflow-y-auto">{children}</main>
          <AppToasts />
            <Player isFreeTier={isFreeTier} />
          </div>
        </div>
      </LocaleProvider>
    </UserProvider>
  )
}
