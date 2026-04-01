import { useEffect, useRef } from "react";
import * as d3 from "d3";

import type { ComposerGraph } from "../types/api";

type Props = {
  graph: ComposerGraph | null;
  onNodeSongNavigate?: (songId: number) => void;
};

function parseNodeId(id: string): { type: "song" | "creator"; entityId: number } | null {
  const m = id.match(/^(song|creator)[\-:](\d+)$/);
  if (!m) {
    return null;
  }
  const type = m[1] === "song" ? "song" : "creator";
  const entityId = Number.parseInt(m[2] ?? "", 10);
  if (!Number.isFinite(entityId)) {
    return null;
  }
  return { type, entityId };
}

export function GraphView({ graph, onNodeSongNavigate }: Props): JSX.Element {
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) {
      return;
    }

    const width = svg.clientWidth || 900;
    const height = 520;

    const root = d3.select(svg);
    root.selectAll("*").remove();

    if (!graph || graph.nodes.length === 0) {
      return;
    }

    const nodes = graph.nodes.map((node) => ({ ...node }));
    const links = graph.edges.map((edge) => ({ ...edge }));
    const creatorToSong = new Map<number, number>();
    for (const edge of links) {
      const src = parseNodeId(String(edge.source));
      const dst = parseNodeId(String(edge.target));
      if (!src || !dst) {
        continue;
      }
      if (src.type === "creator" && dst.type === "song" && !creatorToSong.has(src.entityId)) {
        creatorToSong.set(src.entityId, dst.entityId);
      }
      if (src.type === "song" && dst.type === "creator" && !creatorToSong.has(dst.entityId)) {
        creatorToSong.set(dst.entityId, src.entityId);
      }
    }

    const simulation = d3
      .forceSimulation(nodes as d3.SimulationNodeDatum[])
      .force(
        "link",
        d3
          .forceLink(links)
          .id((d: any) => d.id)
          .distance((d: any) => (d.role === "composer" ? 80 : 110))
      )
      .force("charge", d3.forceManyBody().strength(-180))
      .force("center", d3.forceCenter(width / 2, height / 2));

    const defs = root.append("defs");
    const nmbPattern = defs
      .append("pattern")
      .attr("id", "group-nmb-leopard")
      .attr("patternUnits", "userSpaceOnUse")
      .attr("width", 22)
      .attr("height", 22);

    nmbPattern.append("rect").attr("width", 22).attr("height", 22).attr("fill", "#f2c35a");
    nmbPattern.append("ellipse").attr("cx", 6).attr("cy", 6).attr("rx", 3).attr("ry", 2).attr("fill", "#3d2a15");
    nmbPattern.append("ellipse").attr("cx", 16).attr("cy", 8).attr("rx", 2.5).attr("ry", 2).attr("fill", "#2f1f0e");
    nmbPattern.append("ellipse").attr("cx", 11).attr("cy", 16).attr("rx", 3).attr("ry", 2).attr("fill", "#3a2713");
    nmbPattern.append("ellipse").attr("cx", 19).attr("cy", 18).attr("rx", 2).attr("ry", 1.8).attr("fill", "#2a1a0c");

    const colorByRole = (role: string): string => {
      if (role === "composer") return "#1f5ea8";
      if (role === "arranger") return "#1f8a5b";
      return "#8d6a24";
    };

    const colorByGroup = (groupName?: string): string => {
      if (!groupName) return "#e15a7a";
      if (groupName.includes("乃木坂")) return "#7b5ea7";
      if (groupName.includes("欅坂")) return "#2f8f3c";
      if (groupName.includes("櫻坂")) return "#ff6bb5";
      if (groupName.includes("日向坂")) return "#79d8ff";
      if (groupName.includes("AKB")) return "#ff91b8";
      if (groupName.includes("SKE")) return "#ffd84a";
      if (groupName.includes("NMB")) return "url(#group-nmb-leopard)";
      if (groupName.includes("HKT")) return "#101010";
      if (groupName.includes("STU")) return "#233a7d";
      if (groupName.includes("NGT")) return "#5aa8ff";
      return "#e15a7a";
    };

    const link = root
      .append("g")
      .attr("stroke-opacity", 0.72)
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke", (d: any) => colorByRole(d.role))
      .attr("stroke-width", 1.5)
      .attr("stroke-dasharray", (d: any) => (d.role === "arranger" ? "7 4" : d.role === "lyricist" ? "2 4" : ""));

    const node = root
      .append("g")
      .selectAll("g")
      .data(nodes)
      .join("g")
      .style("cursor", onNodeSongNavigate ? "pointer" : "grab");

    if (!onNodeSongNavigate) {
      const drag = d3
        .drag<SVGGElement, any>()
        .on("start", (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on("drag", (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on("end", (event, d) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        });

      (node as any).call(drag);
    }

    if (onNodeSongNavigate) {
      node.on("click", (_event: MouseEvent, d: any) => {
        const parsed = parseNodeId(String(d.id));
        if (!parsed) {
          return;
        }
        if (parsed.type === "song") {
          onNodeSongNavigate(parsed.entityId);
          return;
        }
        const fallbackSongId = creatorToSong.get(parsed.entityId);
        if (fallbackSongId) {
          onNodeSongNavigate(fallbackSongId);
        }
      });
    }

    node
      .append("path")
      .attr("d", (d: any) => (d.type === "creator" ? "M0,-10A10,10 0 1,1 0,10A10,10 0 1,1 0,-10" : "M-7,-7H7V7H-7Z"))
      .attr("fill", (d: any) => (d.type === "creator" ? "#0a3f7a" : colorByGroup(d.groupName)))
      .attr("opacity", 0.9);

    node
      .append("text")
      .text((d: any) => d.label)
      .attr("font-size", 10)
      .attr("dx", 10)
      .attr("dy", 4)
      .attr("fill", "#1f2d3d");

    simulation.on("tick", () => {
      link
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);

      node.attr("transform", (d: any) => `translate(${d.x},${d.y})`);
    });

    return () => {
      simulation.stop();
    };
  }, [graph, onNodeSongNavigate]);

  return <svg ref={svgRef} className="h-[520px] w-full bg-white" />;
}
