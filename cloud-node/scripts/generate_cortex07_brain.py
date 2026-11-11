#!/usr/bin/env python3
"""Build-time-only cortical specimen poster. No Python in Hostinger runtime.
Purely illustrative 3-D morphology: never evidence of biological neurons."""
import sys
from pathlib import Path
import math
import numpy as np
import vtk
from vtk.util.numpy_support import numpy_to_vtk,numpy_to_vtkIdTypeArray
from PIL import Image

def hemisphere(side, lat=200, lon=280):
    t=np.linspace(.001,np.pi-.001,lat+1)[:,None]
    f=np.linspace(0,2*np.pi,lon+1)[None,:]
    st=np.sin(t);nx=st*np.cos(f);ny=np.broadcast_to(np.cos(t),(lat+1,lon+1))
    nz=st*np.sin(f)
    xx=.66+.705*nx;yy=.06+1.05*ny;zz=.02+.83*nz
    folds=(
      .58*np.sin(17.1*t+3.8*np.sin(f*5.3)+2*np.cos(f*8.5))
        *np.sin(10.7*f+2.7*np.sin(t*9))+
      .30*np.sin(28.3*t+3.8*np.sin(f*9.2))
        *np.sin(24*f+3*np.cos(t*10.3))+
      .12*np.sin(11.5*nx+21.3*ny+5.3*np.sin(nz*12))
        *np.sin(11.7*nz+5.5*nx+4*np.sin(ny*8)))
    delta=.060*folds
    taper=.955+.04*np.sin(t*3)+.04*np.cos(f*2)
    x=side*np.maximum(.012,xx+delta*nx)
    y=yy+delta*ny+.06*np.cos(f*1.2)*st
    z=zz*taper+delta*nz+.035*np.sin(t*4+f*.8)
    pos=np.stack([x,y,z],2).astype('float32').reshape(-1,3)
    ind=[]
    for i in range(lat):
        for j in range(lon):
            a=i*(lon+1)+j;b=a+1;c=a+lon+1;d=c+1
            ind.extend((3,a,c,b,3,b,c,d))
    mesh=vtk.vtkPolyData()
    pts=vtk.vtkPoints();pts.SetData(numpy_to_vtk(pos,deep=True));mesh.SetPoints(pts)
    cells=vtk.vtkCellArray()
    cells.SetCells(lat*lon*2,numpy_to_vtkIdTypeArray(np.array(ind,dtype=np.int64),deep=True))
    mesh.SetPolys(cells)
    smooth=vtk.vtkPolyDataNormals();smooth.SetInputData(mesh)
    smooth.ComputePointNormalsOn();smooth.SplittingOff();smooth.Update()
    poly=smooth.GetOutput()
    ridge=np.clip(.5+folds.ravel()*.6,0,1)
    top=np.clip((pos[:,1]+1.1)/2.3,0,1)
    if side<0:
        dark=np.array([17,51,72]);light=np.array([86,178,178])
        shine=np.array([124,199,184])
    else:
        dark=np.array([31,37,80]);light=np.array([125,121,184])
        shine=np.array([170,178,204])
    colors=(dark[None,:]*(1-ridge[:,None])+light[None,:]*ridge[:,None])
    colors=colors*(.73+.37*top[:,None])
    colors=colors*.84+shine[None,:]*(.16*top[:,None])
    colors=numpy_to_vtk(np.uint8(np.clip(colors,0,255)),deep=True,
                        array_type=vtk.VTK_UNSIGNED_CHAR)
    colors.SetNumberOfComponents(3);poly.GetPointData().SetScalars(colors)
    mapper=vtk.vtkPolyDataMapper();mapper.SetInputData(poly)
    mapper.SetColorModeToDirectScalars()
    actor=vtk.vtkActor();actor.SetMapper(mapper)
    mat=actor.GetProperty();mat.SetInterpolationToPBR()
    mat.SetMetallic(.12);mat.SetRoughness(.36);mat.SetSpecular(.75)
    return actor

def build(out):
    out=Path(out);out.parent.mkdir(parents=True,exist_ok=True)
    ren=vtk.vtkRenderer();ren.SetBackground(0,0,0);ren.SetBackgroundAlpha(0)
    for side in (-1,1):ren.AddActor(hemisphere(side))
    ren.AutomaticLightCreationOff()
    for point,col,intensity in (
      ((1.6,2.5,4.8),(.58,.87,1),2.5),
      ((-2.2,.35,3.3),(.30,1,.90),1.35),
      ((2,-.6,-2),(.52,.35,1),2.25),
      ((-.5,2.4,-2),(.66,.83,1),1.2)):
        lamp=vtk.vtkLight();lamp.SetLightTypeToSceneLight()
        lamp.SetPosition(*point);lamp.SetFocalPoint(0,0,0)
        lamp.SetColor(*col);lamp.SetIntensity(intensity)
        lamp.PositionalOn();lamp.SetConeAngle(65);ren.AddLight(lamp)
    camera=ren.GetActiveCamera()
    camera.SetPosition(.45,.38,5.8);camera.SetFocalPoint(0,0,0)
    camera.SetViewUp(0,1,0);camera.ParallelProjectionOn()
    camera.SetParallelScale(1.65)
    window=vtk.vtkRenderWindow();window.SetSize(1850,1550)
    window.SetOffScreenRendering(1)
    window.SetAlphaBitPlanes(1);window.SetMultiSamples(8)
    window.AddRenderer(ren);window.Render()
    cap=vtk.vtkWindowToImageFilter();cap.SetInput(window)
    cap.SetInputBufferTypeToRGBA();cap.ReadFrontBufferOff();cap.Update()
    tmp=out.with_suffix('.png')
    writer=vtk.vtkPNGWriter();writer.SetFileName(str(tmp))
    writer.SetInputConnection(cap.GetOutputPort());writer.Write()
    img=Image.open(tmp).convert('RGBA')
    if img.getbbox() is None:raise RuntimeError('Empty render, abort package')
    img.save(out,'WEBP',quality=88,method=6)
    tmp.unlink(missing_ok=True)
    print(f'Generated illustration: {out} ({out.stat().st_size} bytes)')

if __name__=='__main__':
    build(sys.argv[1] if len(sys.argv)>1 else
          'src/assets/cortex07_brain.webp')
