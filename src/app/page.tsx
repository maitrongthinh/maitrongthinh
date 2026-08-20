import { preload } from 'react-dom';
import SceneMount from '@/components/three/SceneMount';
import Hero from '@/components/hero/Hero';
import ScrubBand from '@/components/hero/ScrubBand';
import About from '@/components/sections/About';
import Projects from '@/components/sections/Projects';
import Skills from '@/components/sections/Skills';
import Experience from '@/components/sections/Experience';
import GithubStats from '@/components/sections/GithubStats';
import Notes from '@/components/sections/Notes';
import Contact from '@/components/sections/Contact';
import SectionSeam from '@/components/ui/SectionSeam';
import { getGithubData, importedProjects } from '@/lib/github';
import { featuredProjects, heroLayers } from '@/content/content';

/**
 * Home page.
 *
 * Server component: the GitHub numbers and the imported half of the work index
 * are fetched here at build time and baked into the HTML, so the client ships no
 * API code and no loading state.
 *
 * `<Scene />` is a fixed, pointer-transparent canvas at z-0 that every section
 * scrolls over. It is mounted by `<SceneMount />` on the first idle callback, in
 * its own chunk — the WebGL stack must not be in front of the first paint. The
 * camera moves along its path based on scroll position, so the order of the
 * sections below is also the order of the camera's journey — moving a section
 * changes what is behind it.
 */
export default async function Home() {
  const github = await getGithubData();

  // Hand-written projects first, then the allowlisted repositories.
  const projects = [...featuredProjects, ...importedProjects(github)];

  const restingImage = heroLayers.swap ? heroLayers.reveal : heroLayers.base;

  /*
   * The hero plate's resting image, requested during the HTML parse.
   *
   * `RevealLayer` is a client component that probes its two images with
   * `new Image()`, so without this the largest thing on the first screen could not
   * even start downloading until the JS had shipped, parsed and hydrated — the
   * browser has no way to see a URL that only exists inside an effect. Called from
   * this server component, the hint is baked into the exported HTML, above the
   * script tags, and the fetch starts immediately.
   *
   * `preload()` rather than rendering a `<link>`: React hoists a rendered link into
   * `<head>` but also leaves the element where it was written, so the built page
   * carried the same hint twice. This emits exactly one.
   *
   * Only the resting layer is hinted. Its pair is only visible inside the cursor
   * spotlight, so it is left to load on its own and must not compete for bandwidth
   * with the image that is on screen at rest.
   */
  preload(restingImage, { as: 'image', fetchPriority: 'high' });

  return (
    <>
      <SceneMount />

      <main className="relative">
        <Hero />
        <About />
        <SectionSeam index="INTERLUDE" title="MOTION STUDY" note="FOOTAGE / 4S" />
        <ScrubBand />
        <Projects projects={projects} />
        <SectionSeam index="03" title="STACK" note="CAPABILITY" />
        <Skills />
        <Experience />
        <SectionSeam index="05" title="LIVE" note="STRAIGHT FROM GITHUB" />
        <GithubStats data={github} />
        <Notes />
        <SectionSeam index="07" title="TALK" note="OPEN TO WORK" />
        <Contact />
      </main>
    </>
  );
}
