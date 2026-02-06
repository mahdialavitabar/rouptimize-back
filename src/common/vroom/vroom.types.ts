export interface VroomJob {
  id: number;
  description?: string;
  location: [number, number];
  setup?: number;
  service?: number;
  delivery?: number[];
  pickup?: number[];
  skills?: number[];
  priority?: number;
  time_windows?: [number, number][];
}

export interface VroomShipmentStep {
  id: number;
  description?: string;
  location: [number, number];
  setup?: number;
  service?: number;
  time_windows?: [number, number][];
}

export interface VroomShipment {
  pickup: VroomShipmentStep;
  delivery: VroomShipmentStep;
  amount?: number[];
  skills?: number[];
  priority?: number;
}

export interface VroomVehicle {
  id: number;
  profile?: string;
  description?: string;
  start?: [number, number];
  end?: [number, number];
  capacity?: number[];
  skills?: number[];
  time_window?: [number, number];
  breaks?: VroomBreak[];
  speed_factor?: number;
  max_tasks?: number;
  max_travel_time?: number;
  max_distance?: number;
}

export interface VroomBreak {
  id: number;
  time_windows?: [number, number][];
  service?: number;
  description?: string;
}

export interface VroomOptions {
  g?: boolean;
  c?: boolean;
  t?: number;
  x?: number;
  l?: number;
}

export interface VroomRequest {
  jobs?: VroomJob[];
  shipments?: VroomShipment[];
  vehicles: VroomVehicle[];
  matrices?: Record<
    string,
    { durations?: number[][]; distances?: number[][]; costs?: number[][] }
  >;
  options?: VroomOptions;
}

export interface VroomStep {
  type: 'start' | 'job' | 'pickup' | 'delivery' | 'break' | 'end';
  arrival: number;
  duration: number;
  setup: number;
  service: number;
  waiting_time: number;
  violations: VroomViolation[];
  description?: string;
  location?: [number, number];
  id?: number;
  job?: number;
  load?: number[];
  distance?: number;
}

export interface VroomViolation {
  cause: string;
  duration?: number;
}

export interface VroomRoute {
  vehicle: number;
  steps: VroomStep[];
  cost: number;
  setup: number;
  service: number;
  duration: number;
  waiting_time: number;
  priority: number;
  violations: VroomViolation[];
  delivery?: number[];
  pickup?: number[];
  description?: string;
  geometry?: string;
  distance?: number;
}

export interface VroomUnassigned {
  id: number;
  type: 'job' | 'pickup' | 'delivery';
  description?: string;
  location?: [number, number];
}

export interface VroomSummary {
  cost: number;
  routes: number;
  unassigned: number;
  setup: number;
  service: number;
  duration: number;
  waiting_time: number;
  priority: number;
  violations: VroomViolation[];
  delivery?: number[];
  pickup?: number[];
  distance?: number;
}

export interface VroomResponse {
  code: number;
  error?: string;
  summary: VroomSummary;
  unassigned: VroomUnassigned[];
  routes: VroomRoute[];
}

export interface OptimizationInput {
  jobs: Array<{
    id: string;
    location: [number, number];
    service?: number;
    priority?: number;
    timeWindows?: Array<{ start: Date; end: Date }>;
    skills?: number[];
    delivery?: number[];
    pickup?: number[];
  }>;
  vehicles: Array<{
    id: string;
    start?: [number, number];
    end?: [number, number];
    capacity?: number[];
    skills?: number[];
    timeWindow?: { start: Date; end: Date };
    maxTasks?: number;
  }>;
}

export interface OptimizedRoute {
  vehicleId: string;
  orderedJobIds: string[];
  steps: Array<{
    type: 'start' | 'job' | 'end';
    jobId?: string;
    arrival: number;
    duration: number;
    waitingTime: number;
    location?: [number, number];
  }>;
  totalDistance: number;
  totalDuration: number;
  geometry?: string;
}

export interface OptimizationResult {
  routes: OptimizedRoute[];
  unassigned: string[];
  summary: {
    totalCost: number;
    totalDistance: number;
    totalDuration: number;
  };
}
