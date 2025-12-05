import React, { useCallback, useRef } from "react";
import { BodyTemplate } from "./types";
import { SimulationCanvas } from "./components/SimulationCanvas";
import { SimulationControls } from "./components/SimulationControls";
import { Sidebar } from "./components/Sidebar";
import { useSimulation } from "./hooks/useSimulation";
import { usePlayback } from "./hooks/usePlayback";
import { usePlanetManagement } from "./hooks/usePlanetManagement";
import { useCanvasDragging } from "./hooks/useCanvasDragging";
import { useSystemState, useAutoSimulation } from "./hooks/useSystemState";
import { usePlanetVisualsAndSample } from "./hooks/usePlanetVisualsAndSample";
import { usePlanetHandlers } from "./hooks/usePlanetHandlers";
import "./App.css";

const App: React.FC = () => {
  const { system, setSystem, buildSimulationPayload } = useSystemState();
  const { data, isComputing, error, runSimulation, computeRequestRef } = useSimulation();
  const hasSimData = !!(data?.samples?.length && data?.planetMetadata?.length);
  const trajectoryThrottleRef = useRef<number | null>(null);

  const { playing, playhead, blinkingPlanets, handlePlay, handlePause, handleReset, playStartRef, loopDurationRef } =
    usePlayback(data, hasSimData, isComputing, system.dtSec);

  const {
    selectedPlanetName,
    customBody,
    trajectory,
    predicting,
    setSelectedPlanetName,
    setTrajectory,
    syncCustomBodyToPlanet,
    computeTrajectoryPreview,
    handleSpawnPlanet,
    handleCustomBodyChange,
    previewRequestRef,
  } = usePlanetManagement({ buildSimulationPayload });

  const { isDragging, draggingPlanetName, latestDraggedPlanetRef, handleCanvasMouseDown, handleCanvasMouseMove, stopDragging, clearDraggingPlanetName } =
    useCanvasDragging();

  const { planetVisuals, currentSample } = usePlanetVisualsAndSample(system.planets, data, hasSimData, playhead, system.dtSec);

  useAutoSimulation({
    planets: system.planets,
    isDragging,
    buildSimulationPayload,
    runSimulation,
    computeRequestRef,
    playStartRef,
    clearDraggingPlanetName,
  });

  const { handlePlanetSelect, handlePlanetRemove, handleSpawnPlanetClick, handleBodyConfigChange } = usePlanetHandlers({
    systemPlanets: system.planets,
    selectedPlanetName,
    isDragging,
    setSystem,
    setSelectedPlanetName,
    setTrajectory,
    syncCustomBodyToPlanet,
    computeTrajectoryPreview,
    handleSpawnPlanet,
    handleCustomBodyChange,
    latestDraggedPlanetRef,
  });

  const onCanvasMouseDown = useCallback(
    (evt: React.MouseEvent<SVGSVGElement>) => {
      handleCanvasMouseDown(evt, currentSample, system.planets, (planet) => {
        setSelectedPlanetName(planet.name);
        syncCustomBodyToPlanet(planet);
        latestDraggedPlanetRef.current = planet;
        previewRequestRef.current += 1;
        setTrajectory(null);
      });
    },
    [handleCanvasMouseDown, currentSample, system.planets, setSelectedPlanetName, syncCustomBodyToPlanet, setTrajectory]
  );

  const onCanvasMouseMove = useCallback(
    (evt: React.MouseEvent<SVGSVGElement>) => {
      handleCanvasMouseMove(evt, (planetName, simX, simY, distance) => {
        setSystem((prev) => {
          const updatedPlanets = prev.planets.map((p) => {
            if (p.name !== planetName) return p;
            const next: BodyTemplate = { ...p, aAU: distance, position: [simX, simY, 0] };
            latestDraggedPlanetRef.current = next;
            return next;
          });

          // Throttle trajectory computation to avoid too many API calls
          if (trajectoryThrottleRef.current) {
            clearTimeout(trajectoryThrottleRef.current);
          }
          trajectoryThrottleRef.current = window.setTimeout(() => {
            const draggedPlanet = latestDraggedPlanetRef.current;
            if (draggedPlanet) {
              computeTrajectoryPreview(draggedPlanet, updatedPlanets);
            }
          }, 150); // Throttle to 150ms

          return {
            ...prev,
            planets: updatedPlanets,
          };
        });
      });
    },
    [handleCanvasMouseMove, computeTrajectoryPreview]
  );

  const onCanvasMouseUp = useCallback(() => {
    stopDragging();
    // Don't call computeTrajectoryPreview here - let useAutoSimulation handle it
    // This prevents the snap-back behavior where the planet jumps to its old position
    // while waiting for the new simulation to complete
  }, [stopDragging]);

  const totalDuration = loopDurationRef.current;
  const progress = totalDuration > 0 ? (playhead / totalDuration) * 100 : 0;

  return (
    <div className="app-container">
      <header className="app-header">
        <h1 className="app-header__title">🪐 Musical Solar System</h1>
        <p className="app-header__subtitle">Create planets and hear the music of their orbits</p>
      </header>

      <div className="app-main">
        <Sidebar
          customBody={customBody}
          selectedPlanetName={selectedPlanetName}
          predicting={predicting}
          planets={system.planets}
          isComputing={isComputing}
          error={error}
          onBodyConfigChange={handleBodyConfigChange}
          onSpawnPlanet={handleSpawnPlanetClick}
          onPlanetSelect={handlePlanetSelect}
          onPlanetRemove={handlePlanetRemove}
        />

        <main className="simulation-container">
          <SimulationControls
            canPlay={hasSimData && !isComputing && !playing}
            canPause={playing}
            canReset={hasSimData}
            playhead={playhead}
            totalDuration={totalDuration}
            progress={progress}
            isComputing={isComputing}
            onPlay={handlePlay}
            onPause={handlePause}
            onReset={handleReset}
          />

          <SimulationCanvas
            currentSample={currentSample}
            trajectory={trajectory}
            selectedPlanetName={selectedPlanetName}
            draggingPlanetName={draggingPlanetName}
            blinkingPlanets={blinkingPlanets}
            systemPlanets={system.planets}
            planetVisuals={planetVisuals}
            isDragging={isDragging}
            onMouseDown={onCanvasMouseDown}
            onMouseMove={onCanvasMouseMove}
            onMouseUp={onCanvasMouseUp}
            onMouseLeave={onCanvasMouseUp}
          />

          <p className="simulation-instructions">
            Click a planet to select it • Drag to reposition • Adjust properties in the left panel
          </p>
        </main>
      </div>
    </div>
  );
};

export default App;
