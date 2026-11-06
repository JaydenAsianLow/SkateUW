import { forwardRef, useMemo } from 'react';
import { Bloom, DepthOfField, EffectComposer, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing';
import { Effect, ToneMappingMode } from 'postprocessing';
import { Uniform, Vector3 } from 'three';

// DESIGN.md §8. The Canvas uses `flat` (no renderer tone mapping), so it is applied once here, after bloom.

// Warm grade: lift shadows toward red-brown, push highlights toward gold. Never cold.
class WarmGradeEffect extends Effect {
  constructor({ amount = 1 } = {}) {
    super(
      'WarmGrade',
      /* glsl */ `
      uniform float amount;
      uniform vec3 shadowTint;
      uniform vec3 highlightTint;
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        vec3 c = inputColor.rgb;
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        float sh = 1.0 - smoothstep(0.0, 0.45, l);
        float hi = smoothstep(0.45, 1.0, l);
        c += shadowTint * sh * amount;
        c = mix(c, c * highlightTint, hi * amount);
        // Gentle saturation trim so it stays moderate, not punchy.
        c = mix(vec3(dot(c, vec3(0.2126, 0.7152, 0.0722))), c, 0.94);
        outputColor = vec4(c, inputColor.a);
      }`,
      {
        uniforms: new Map([
          ['amount', new Uniform(amount)],
          ['shadowTint', new Uniform(new Vector3(0.022, 0.007, 0.0))],
          ['highlightTint', new Uniform(new Vector3(1.04, 1.0, 0.9))],
        ]),
      },
    );
  }
}

const WarmGrade = forwardRef(function WarmGrade({ amount = 1 }, ref) {
  const effect = useMemo(() => new WarmGradeEffect({ amount }), [amount]);
  return <primitive ref={ref} object={effect} dispose={null} />;
});

export default function Effects() {
  return (
    <EffectComposer multisampling={0}>
      <DepthOfField focusDistance={2.8} focusRange={14} bokehScale={2.2} />
      <Bloom mipmapBlur intensity={0.75} luminanceThreshold={0.95} luminanceSmoothing={0.25} radius={0.75} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <WarmGrade />
      <Vignette offset={0.35} darkness={0.38} />
      <SMAA />
    </EffectComposer>
  );
}
