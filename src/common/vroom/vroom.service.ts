import { Injectable, Logger } from '@nestjs/common';
import {
  OptimizationInput,
  OptimizationResult,
  OptimizedRoute,
  VroomJob,
  VroomRequest,
  VroomResponse,
  VroomVehicle,
} from './vroom.types';

@Injectable()
export class VroomService {
  private readonly logger = new Logger(VroomService.name);
  private readonly vroomUrl: string;
  private readonly osrmUrl: string;

  constructor() {
    this.vroomUrl = process.env.VROOM_URL || 'http://localhost:3001';
    this.osrmUrl = process.env.OSRM_URL || 'http://localhost:5000';
  }

  private dateToVroomTimestamp(date: Date): number {
    return Math.floor(date.getTime() / 1000);
  }

  private buildVroomRequest(input: OptimizationInput): VroomRequest {
    const jobIdToNumericId = new Map<string, number>();
    const vehicleIdToNumericId = new Map<string, number>();

    const jobs: VroomJob[] = input.jobs.map((job, index) => {
      const numericId = index + 1;
      jobIdToNumericId.set(job.id, numericId);

      const vroomJob: VroomJob = {
        id: numericId,
        description: job.id,
        location: job.location,
        service: job.service ?? 300,
        priority: job.priority ?? 0,
      };

      if (job.skills?.length) {
        vroomJob.skills = job.skills;
      }

      if (job.delivery?.length) {
        vroomJob.delivery = job.delivery;
      }

      if (job.pickup?.length) {
        vroomJob.pickup = job.pickup;
      }

      if (job.timeWindows?.length) {
        vroomJob.time_windows = job.timeWindows.map((tw) => [
          this.dateToVroomTimestamp(tw.start),
          this.dateToVroomTimestamp(tw.end),
        ]);
      }

      return vroomJob;
    });

    const vehicles: VroomVehicle[] = input.vehicles.map((vehicle, index) => {
      const numericId = index + 1;
      vehicleIdToNumericId.set(vehicle.id, numericId);

      const vroomVehicle: VroomVehicle = {
        id: numericId,
        description: vehicle.id,
        profile: 'car',
      };

      if (vehicle.start) {
        vroomVehicle.start = vehicle.start;
      }

      if (vehicle.end) {
        vroomVehicle.end = vehicle.end;
      }

      if (vehicle.capacity?.length) {
        vroomVehicle.capacity = vehicle.capacity;
      }

      if (vehicle.skills?.length) {
        vroomVehicle.skills = vehicle.skills;
      }

      if (vehicle.timeWindow) {
        vroomVehicle.time_window = [
          this.dateToVroomTimestamp(vehicle.timeWindow.start),
          this.dateToVroomTimestamp(vehicle.timeWindow.end),
        ];
      }

      if (vehicle.maxTasks) {
        vroomVehicle.max_tasks = vehicle.maxTasks;
      }

      return vroomVehicle;
    });

    return {
      jobs,
      vehicles,
      options: { g: true },
    };
  }

  private parseVroomResponse(
    response: VroomResponse,
    input: OptimizationInput,
  ): OptimizationResult {
    const vehicleNumericToId = new Map<number, string>();
    input.vehicles.forEach((v, i) => vehicleNumericToId.set(i + 1, v.id));

    const routes: OptimizedRoute[] = response.routes.map((route) => {
      const vehicleId =
        vehicleNumericToId.get(route.vehicle) ?? String(route.vehicle);

      const orderedJobIds: string[] = [];
      const steps = route.steps
        .filter((step) => ['start', 'job', 'end'].includes(step.type))
        .map((step) => {
          const result: OptimizedRoute['steps'][0] = {
            type: step.type as 'start' | 'job' | 'end',
            arrival: step.arrival,
            duration: step.duration,
            waitingTime: step.waiting_time,
            location: step.location,
          };

          if (step.type === 'job' && step.description) {
            result.jobId = step.description;
            orderedJobIds.push(step.description);
          }

          return result;
        });

      return {
        vehicleId,
        orderedJobIds,
        steps,
        totalDistance: route.distance ?? 0,
        totalDuration: route.duration,
        geometry: route.geometry,
      };
    });

    const unassigned = response.unassigned.map(
      (u) => u.description ?? String(u.id),
    );

    return {
      routes,
      unassigned,
      summary: {
        totalCost: response.summary.cost,
        totalDistance: response.summary.distance ?? 0,
        totalDuration: response.summary.duration,
      },
    };
  }

  async optimize(input: OptimizationInput): Promise<OptimizationResult> {
    if (!input.jobs.length) {
      return {
        routes: [],
        unassigned: [],
        summary: { totalCost: 0, totalDistance: 0, totalDuration: 0 },
      };
    }

    if (!input.vehicles.length) {
      return {
        routes: [],
        unassigned: input.jobs.map((j) => j.id),
        summary: { totalCost: 0, totalDistance: 0, totalDuration: 0 },
      };
    }

    const vroomRequest = this.buildVroomRequest(input);

    try {
      this.logger.debug(
        `Sending optimization request to VROOM: ${this.vroomUrl}`,
      );

      const response = await fetch(this.vroomUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vroomRequest),
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(
          `VROOM request failed: ${response.status} - ${errorText}`,
        );
        throw new Error(`VROOM optimization failed: ${response.status}`);
      }

      const vroomResponse = (await response.json()) as VroomResponse;

      if (vroomResponse.code !== 0) {
        this.logger.error(`VROOM returned error: ${vroomResponse.error}`);
        throw new Error(vroomResponse.error || 'VROOM optimization failed');
      }

      return this.parseVroomResponse(vroomResponse, input);
    } catch (error) {
      this.logger.error('VROOM optimization error:', error);
      throw error;
    }
  }

  async optimizeSingleVehicleRoute(
    jobs: Array<{
      id: string;
      location: [number, number];
      service?: number;
      priority?: number;
      timeWindows?: Array<{ start: Date; end: Date }>;
    }>,
    vehicleStart?: [number, number],
    vehicleEnd?: [number, number],
  ): Promise<{
    orderedJobIds: string[];
    totalDistance: number;
    totalDuration: number;
    geometry?: string;
  }> {
    if (jobs.length === 0) {
      return {
        orderedJobIds: [],
        totalDistance: 0,
        totalDuration: 0,
      };
    }

    if (jobs.length === 1) {
      return {
        orderedJobIds: [jobs[0].id],
        totalDistance: 0,
        totalDuration: 0,
      };
    }

    const effectiveStart = vehicleStart ?? jobs[0].location;
    const effectiveEnd = vehicleEnd ?? jobs[jobs.length - 1].location;

    const input: OptimizationInput = {
      jobs,
      vehicles: [
        {
          id: 'vehicle-1',
          start: effectiveStart,
          end: effectiveEnd,
        },
      ],
    };

    try {
      const result = await this.optimize(input);

      if (result.routes.length > 0) {
        const route = result.routes[0];
        return {
          orderedJobIds: route.orderedJobIds,
          totalDistance: route.totalDistance,
          totalDuration: route.totalDuration,
          geometry: route.geometry,
        };
      }

      return {
        orderedJobIds: jobs.map((j) => j.id),
        totalDistance: 0,
        totalDuration: 0,
      };
    } catch (error) {
      this.logger.warn(
        'VROOM optimization failed, falling back to input order',
        error,
      );
      return {
        orderedJobIds: jobs.map((j) => j.id),
        totalDistance: 0,
        totalDuration: 0,
      };
    }
  }

  async fetchRouteGeometry(coordinates: [number, number][]): Promise<{
    geometry: { type: 'LineString'; coordinates: [number, number][] };
    distance: number;
    duration: number;
  } | null> {
    if (coordinates.length < 2) {
      return null;
    }

    const coordsString = coordinates.map((c) => `${c[0]},${c[1]}`).join(';');
    const url = `${this.osrmUrl}/route/v1/driving/${coordsString}?overview=full&geometries=geojson`;

    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        this.logger.error(`OSRM route request failed: ${response.status}`);
        return null;
      }

      const data = (await response.json()) as {
        code: string;
        routes?: Array<{
          geometry: { type: 'LineString'; coordinates: [number, number][] };
          distance: number;
          duration: number;
        }>;
      };

      if (data.code !== 'Ok' || !data.routes?.length) {
        this.logger.warn(`OSRM returned no routes: ${data.code}`);
        return null;
      }

      const route = data.routes[0];
      return {
        geometry: route.geometry,
        distance: route.distance,
        duration: route.duration,
      };
    } catch (error) {
      this.logger.error('OSRM route fetch error:', error);
      return null;
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.vroomUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
