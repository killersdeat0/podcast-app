import Sidebar from '@/components/ui/Sidebar'
import Player from '@/components/player/Player'
import AdBanner from '@/components/ui/AdBanner'
import { createClient } from '@/lib/supabase/server'
import { LocaleProvider } from '@/lib/i18n/LocaleContext'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
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
    <LocaleProvider>
      <div className="flex h-screen bg-gray-950 text-white overflow-hidden">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          {isFreeTier && <AdBanner />}
          <main className="flex-1 overflow-y-auto">{children}</main>
          <Player isFreeTier={isFreeTier} />
        </div>
      </div>
    </LocaleProvider>
  )
}
