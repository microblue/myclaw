import type { FC, ReactNode } from 'react'

import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import { AuthProvider } from '@/lib/auth'
import { ScrollToTop, Toast, ProtectedRoute } from '@/components'
import { TooltipProvider } from '@/components/ui'
import { ROUTES } from '@/lib'
import { useThemeEffect, useLanguageEffect, useRefer } from '@/hooks'

import Desktop from '@/pages/Desktop'
import Landing from '@/pages/Landing'
const Login = lazy(() => import('@/pages/Login'))
const Dashboard = lazy(() => import('@/pages/Dashboard'))
const NewClawShell = lazy(() => import('@/pages/NewClaw/WizardShell'))
const NewClawStepType = lazy(() => import('@/pages/NewClaw/StepType'))
const NewClawStepProvider = lazy(() => import('@/pages/NewClaw/StepProvider'))
const NewClawStepPlan = lazy(() => import('@/pages/NewClaw/StepPlan'))
const NewClawStepReview = lazy(() => import('@/pages/NewClaw/StepReview'))
const ClawDetail = lazy(() => import('@/pages/ClawDetail'))
const Account = lazy(() => import('@/pages/Account'))
const Billing = lazy(() => import('@/pages/Billing'))
const Affiliate = lazy(() => import('@/pages/Affiliate'))
const Admin = lazy(() => import('@/pages/Admin'))
const License = lazy(() => import('@/pages/License'))
const Terms = lazy(() => import('@/pages/Terms'))
const Privacy = lazy(() => import('@/pages/Privacy'))
const Changelog = lazy(() => import('@/pages/Changelog'))
const DesktopChangelog = lazy(() => import('@/pages/DesktopChangelog'))
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
                        <Route path={ROUTES.GO} element={<Desktop />} />
                        <Route
                            path={ROUTES.DESKTOP_CHANGELOG}
                            element={<DesktopChangelog />}
                        />
                        <Route path={ROUTES.LOGIN} element={<Login />} />
                        <Route path={ROUTES.TERMS} element={<Terms />} />
                        <Route path={ROUTES.PRIVACY} element={<Privacy />} />
                        <Route
                            path={ROUTES.CHANGELOG}
                            element={<Changelog />}
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
                                    <Dashboard />
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