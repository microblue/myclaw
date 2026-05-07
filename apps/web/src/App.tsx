import type { FC, ReactNode } from 'react'

import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate, useParams } from 'react-router-dom'
import { userRole } from '@openclaw/shared'
import { AuthProvider } from '@/lib/auth'
import { ScrollToTop, Toast, ProtectedRoute } from '@/components'
import { TooltipProvider } from '@/components/ui'
import { ROUTES } from '@/lib'
import { useThemeEffect, useLanguageEffect, useRefer, useProfile } from '@/hooks'

// /install/:id (legacy) → /aios/install/:id (canonical). The id has
// to be carried through so we pull it from the URL.
const InstallProgressRedirect: FC = () => {
    const { id } = useParams<{ id: string }>()
    return <Navigate to={`/aios/install/${id ?? ''}`} replace />
}

// Per docs/aios-design.md §3, /claws is no longer the canonical URL
// for any role:
//   super_admin → /admin (fleet view)
//   partner     → /partner (own codes dashboard)
//   end_user    → /aios   (AI-OS list)
// Profile is fetched from cache when available; while loading we keep
// rendering the dashboard so a momentary refresh doesn't bounce the
// user. Once the role is known, we Navigate replace: true so the
// legacy /claws URL doesn't pile up in browser history.
const ClawsRoleRedirect: FC = () => {
    const { data: profile, isLoading } = useProfile()
    if (isLoading || !profile) return <DashboardLazy />
    if (profile.role === userRole.admin)
        return <Navigate to={ROUTES.ADMIN_FLEET} replace />
    if (profile.role === userRole.partner)
        return <Navigate to={ROUTES.PARTNER} replace />
    return <Navigate to={ROUTES.AIOS} replace />
}

import Landing from '@/pages/Landing'
const Login = lazy(() => import('@/pages/Login'))
const Dashboard = lazy(() => import('@/pages/Dashboard'))
const DashboardLazy = Dashboard
const NewClawShell = lazy(() => import('@/pages/NewClaw/WizardShell'))
const NewClawStepType = lazy(() => import('@/pages/NewClaw/StepType'))
const NewClawStepProvider = lazy(() => import('@/pages/NewClaw/StepProvider'))
const NewClawStepPlan = lazy(() => import('@/pages/NewClaw/StepPlan'))
const NewClawStepReview = lazy(() => import('@/pages/NewClaw/StepReview'))
const RedeemCode = lazy(() => import('@/pages/RedeemCode'))
const InstallProgress = lazy(() => import('@/pages/Install/Progress'))
const IntentDetail = lazy(() => import('@/pages/Intent/Detail'))
const AiosHome = lazy(() => import('@/pages/Aios/Home'))
const ClawDetail = lazy(() => import('@/pages/ClawDetail'))
const Account = lazy(() => import('@/pages/Account'))
const Billing = lazy(() => import('@/pages/Billing'))
const Affiliate = lazy(() => import('@/pages/Affiliate'))
const Admin = lazy(() => import('@/pages/Admin'))
const Partner = lazy(() => import('@/pages/Partner'))
const MintCodesShell = lazy(() => import('@/pages/MintCodes/WizardShell'))
const MintCodesStepProvider = lazy(
    () => import('@/pages/MintCodes/StepProvider')
)
const MintCodesStepPlan = lazy(() => import('@/pages/MintCodes/StepPlan'))
const MintCodesStepDetails = lazy(
    () => import('@/pages/MintCodes/StepDetails')
)
const MintCodesStepReview = lazy(() => import('@/pages/MintCodes/StepReview'))
const License = lazy(() => import('@/pages/License'))
const Terms = lazy(() => import('@/pages/Terms'))
const Privacy = lazy(() => import('@/pages/Privacy'))
const Changelog = lazy(() => import('@/pages/Changelog'))
const WhatsNew = lazy(() => import('@/pages/WhatsNew'))
const Blog = lazy(() => import('@/pages/Blog'))
const BlogPost = lazy(() => import('@/pages/BlogPost'))
const AffiliateProgram = lazy(() => import('@/pages/AffiliateProgram'))
const Compare = lazy(() => import('@/pages/Compare'))
const NotFound = lazy(() => import('@/pages/NotFound'))

const App: FC = (): ReactNode => {
    useThemeEffect()
    useRefer()
    const language = useLanguageEffect()

    return (
        <TooltipProvider delayDuration={300}>
            <AuthProvider>
                <ScrollToTop />
                <Toast />
                <Suspense
                    key={language}
                    fallback={
                        <div className='bg-background flex min-h-screen items-center justify-center'>
                            <div className='h-6 w-6 animate-spin rounded-full border-2 border-current border-t-transparent opacity-50' />
                        </div>
                    }
                >
                    <Routes>
                        <Route path={ROUTES.HOME} element={<Landing />} />
                        <Route path={ROUTES.LOGIN} element={<Login />} />
                        <Route path={ROUTES.TERMS} element={<Terms />} />
                        <Route path={ROUTES.PRIVACY} element={<Privacy />} />
                        <Route
                            path={ROUTES.CHANGELOG}
                            element={<Changelog />}
                        />
                        <Route
                            path={ROUTES.WHATS_NEW}
                            element={<WhatsNew />}
                        />
                        <Route path={ROUTES.BLOG} element={<Blog />} />
                        <Route path={ROUTES.BLOG_POST} element={<BlogPost />} />
                        <Route
                            path={ROUTES.AFFILIATE_PROGRAM}
                            element={<AffiliateProgram />}
                        />
                        <Route path={ROUTES.COMPARE} element={<Compare />} />
                        <Route
                            path={ROUTES.CLAWS}
                            element={
                                <ProtectedRoute>
                                    <ClawsRoleRedirect />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path={ROUTES.CLAW_DETAIL}
                            element={
                                <ProtectedRoute>
                                    <ClawDetail />
                                </ProtectedRoute>
                            }
                        />
                        {/*
                          Canonical AI-OS URLs per design §3. /aios is
                          the end-user landing (today: same Dashboard
                          rendering as /claws; in P4 this becomes the
                          Intent home). /aios/:id mirrors /claws/:id
                          for the same reason.
                        */}
                        <Route
                            path={ROUTES.AIOS}
                            element={
                                <ProtectedRoute>
                                    <AiosHome />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path={ROUTES.AIOS_DETAIL}
                            element={
                                <ProtectedRoute>
                                    <ClawDetail />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path={ROUTES.AIOS_INSTALL}
                            element={
                                <ProtectedRoute>
                                    <RedeemCode />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path={ROUTES.AIOS_INSTALL_PROGRESS}
                            element={
                                <ProtectedRoute>
                                    <InstallProgress />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path={ROUTES.AIOS_INTENT}
                            element={
                                <ProtectedRoute>
                                    <IntentDetail />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path={ROUTES.NEW_CLAW}
                            element={
                                <ProtectedRoute>
                                    <NewClawShell />
                                </ProtectedRoute>
                            }
                        >
                            <Route index element={<NewClawStepType />} />
                            <Route
                                path='provider'
                                element={<NewClawStepProvider />}
                            />
                            <Route
                                path='plan'
                                element={<NewClawStepPlan />}
                            />
                            <Route
                                path='review'
                                element={<NewClawStepReview />}
                            />
                        </Route>
                        {/*
                          Legacy redirects per design §3. The redeem
                          and install-progress flows live under /aios/*
                          now; the old paths 301-equivalent through
                          react-router's Navigate replace.
                        */}
                        <Route
                            path={ROUTES.REDEEM_CODE}
                            element={
                                <Navigate
                                    to={ROUTES.AIOS_INSTALL}
                                    replace
                                />
                            }
                        />
                        <Route
                            path={ROUTES.INSTALL_PROGRESS}
                            element={<InstallProgressRedirect />}
                        />
                        <Route
                            path={ROUTES.ACCOUNT}
                            element={
                                <ProtectedRoute>
                                    <Account />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path={ROUTES.BILLING}
                            element={
                                <ProtectedRoute>
                                    <Billing />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path={ROUTES.AFFILIATE}
                            element={
                                <ProtectedRoute>
                                    <Affiliate />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path={ROUTES.ADMIN}
                            element={
                                <ProtectedRoute>
                                    <Admin />
                                </ProtectedRoute>
                            }
                        />
                        {/*
                          Per docs/aios-design.md §3, each admin section
                          gets a canonical `/admin/<section>` URL. The
                          Admin component reads the URL segment to pick
                          the active tab, so all 8 routes mount the
                          same component — react-router doesn't
                          actually route inside; the component does.
                        */}
                        <Route
                            path={ROUTES.ADMIN_ANALYTICS}
                            element={
                                <ProtectedRoute>
                                    <Admin />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path={ROUTES.ADMIN_USERS}
                            element={
                                <ProtectedRoute>
                                    <Admin />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path={ROUTES.ADMIN_FLEET}
                            element={
                                <ProtectedRoute>
                                    <Admin />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path={ROUTES.ADMIN_CODES}
                            element={
                                <ProtectedRoute>
                                    <Admin />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path={ROUTES.ADMIN_INSTALL_REPORTS}
                            element={
                                <ProtectedRoute>
                                    <Admin />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path={ROUTES.ADMIN_SETTINGS}
                            element={
                                <ProtectedRoute>
                                    <Admin />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path={ROUTES.PARTNER}
                            element={
                                <ProtectedRoute>
                                    <Partner />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path={ROUTES.MINT_CODES}
                            element={
                                <ProtectedRoute>
                                    <MintCodesShell />
                                </ProtectedRoute>
                            }
                        >
                            <Route index element={<MintCodesStepProvider />} />
                        </Route>
                        <Route
                            path={ROUTES.MINT_CODES_PLAN}
                            element={
                                <ProtectedRoute>
                                    <MintCodesShell />
                                </ProtectedRoute>
                            }
                        >
                            <Route index element={<MintCodesStepPlan />} />
                        </Route>
                        <Route
                            path={ROUTES.MINT_CODES_DETAILS}
                            element={
                                <ProtectedRoute>
                                    <MintCodesShell />
                                </ProtectedRoute>
                            }
                        >
                            <Route index element={<MintCodesStepDetails />} />
                        </Route>
                        <Route
                            path={ROUTES.MINT_CODES_REVIEW}
                            element={
                                <ProtectedRoute>
                                    <MintCodesShell />
                                </ProtectedRoute>
                            }
                        >
                            <Route index element={<MintCodesStepReview />} />
                        </Route>
                        <Route
                            path={ROUTES.LICENSE}
                            element={
                                <ProtectedRoute>
                                    <License />
                                </ProtectedRoute>
                            }
                        />
                        <Route path='*' element={<NotFound />} />
                    </Routes>
                </Suspense>
            </AuthProvider>
        </TooltipProvider>
    )
}

export default App