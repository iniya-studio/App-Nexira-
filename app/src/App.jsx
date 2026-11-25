// CI rebuild marker: verify the latest Top 10 ranking APK artifact.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Activity, ArrowLeft, ArrowRight, BarChart3, Bell, Brain, Check, Cpu,
  ChevronRight, Clock3, Flame, Globe2, Home, Languages, Medal, Play,
  RotateCcw, Scan, Settings, ShoppingCart, Sigma, Sparkles, Target, Timer,
  Trophy, UserRound, Zap, Atom,
} from 'lucide-react';
import {
  MODE_TIMES, completeLanguageSelection, hasCompletedLanguageSelection, loadProfile, saveProfile,
} from './game/data.js';
