import {
	AnimationClip,
	AnimationMixer,
	Matrix4,
	Quaternion,
	QuaternionKeyframeTrack,
	SkeletonHelper,
	Vector3,
	VectorKeyframeTrack,
	Bone
} from 'three';

const _m1 = new Matrix4();
const _m2 = new Matrix4();
const _inverseBindMatrix = new Matrix4();

const _mSourceWorld = new Matrix4();
const _mSourceParentBindWorld = new Matrix4();
const _mSourceBindWorld = new Matrix4();
const _mSourceBindLocal = new Matrix4();
const _mSourceLocal = new Matrix4();
const _mSourceRelative = new Matrix4();
const _mSourceBindToCurrentLocal = new Matrix4();
const _mTargetBindLocal = new Matrix4();
const _mTargetBindWorld = new Matrix4();
const _mResult = new Matrix4();

const _q1 = new Quaternion();
const _q2 = new Quaternion();

const _qSourceWorld = new Quaternion();
const _qSourceParentWorld = new Quaternion();
const _qSourceBindWorld = new Quaternion();
const _qSourceLocal = new Quaternion();
const _qTargetBindToWorld = new Quaternion();
const _qSourceWorldToBind = new Quaternion()


const _v1 = new Vector3();
const _vIgnore = new Vector3();


/**
 * @typedef RetargetOptions
 * @property {string} [root] - name of the source's root bone
 * @property {THREE.Matrix4} [rootOffset] - offset transformation to apply to root bone
 * @property {{[target: string]: string}} [names] - maps from target bone names to source names
 * @property {'absolute'|'relative'} [orientationMode] - 'absolute' means target bones will match the orientation of source bones exactly, 'relative' means orientations will be transferred relative to each skeleton's bind pose.
 * 
 * @param {THREE.Skeleton} target
 * @param {THREE.Skeleton} source
 * @param {RetargetOptions} _options
 */
function retargetV2( target, source, _options = {} ) {

	const _defaultOptions = {
		root: 'hip',
		names: {},
		orientationMode: 'absolute'
	}

	/** Options filled with default values */
	const options = Object.assign(_defaultOptions, _options)

	/**
	 * Maps from source bone name to index
	 * @type {Map<string, number>}
	 */
	const sourceBoneIndices = new Map();

	for ( let i = 0; i < source.bones.length; ++ i ) {

		const sourceBone = source.bones[i];

		sourceBoneIndices.set( sourceBone.name, i );

	}

	/** @type {number} */
	const sourceRootBoneIndex = sourceBoneIndices.get( options.root );

	// source.bones[0].updateMatrixWorld();

	target.pose();
	// target.bones[ 0 ].updateMatrixWorld();

	for ( let i = 0; i < target.bones.length; ++ i ) {

		const targetBone = target.bones[ i ];
		const sourceBoneName = options.names[ targetBone.name ] ?? targetBone.name;
		const sourceBoneIndex = sourceBoneIndices.get( sourceBoneName );

		if ( sourceBoneIndex === undefined ) continue;

		const sourceBone = source.bones[ sourceBoneIndex ];

		if ( !['hip', 'abdomen'].includes( sourceBoneName ) ) {

			// continue;
			
		}


		// source bind

		_mSourceBindWorld.copy( source.boneInverses[ sourceBoneIndex ] ).invert();


		// source parent bind
		
		if ( sourceBone.parent instanceof Bone ) {

			const sourceParentBoneIndex = sourceBoneIndices.get( sourceBone.parent.name );
			
			_mSourceParentBindWorld.copy( source.boneInverses[ sourceParentBoneIndex ] ).invert();
			
		} else {

			_mSourceParentBindWorld.identity()
			
		}


		// source bind relative to parent

		_mSourceBindLocal
			.copy( _mSourceParentBindWorld )
			.invert()
			.multiply( _mSourceBindWorld );


		// source current relative to parent

		_mSourceLocal.copy( sourceBone.matrix );


		// source current relative to bind

		 _mSourceRelative
		 	.copy( _mSourceBindLocal )
		 	.invert()
		 	.multiply( _mSourceLocal );
		

		// apply to target local transforms (previously reset to bind pose)

		targetBone.matrix.multiply( _mSourceRelative );

		if (sourceBoneName === options.root) {

			if (options.rootOffset) targetBone.matrix.premultiply( options.rootOffset );

			targetBone.matrix.decompose( targetBone.position, targetBone.quaternion, _vIgnore );

		} else {

			targetBone.matrix.decompose( _vIgnore, targetBone.quaternion, _vIgnore );

		}

	}
}

function retarget( target, source, options = {} ) {

	const pos = new Vector3(),
		quat = new Quaternion(),
		scale = new Vector3(),
		bindBoneMatrix = new Matrix4(),
		relativeMatrix = new Matrix4(),
		globalMatrix = new Matrix4();

	options.preserveMatrix = options.preserveMatrix !== undefined ? options.preserveMatrix : true;
	options.preservePosition = options.preservePosition !== undefined ? options.preservePosition : true;
	options.preserveHipPosition = options.preserveHipPosition !== undefined ? options.preserveHipPosition : false;
	options.useTargetMatrix = options.useTargetMatrix !== undefined ? options.useTargetMatrix : false;
	options.hip = options.hip !== undefined ? options.hip : 'hip';
	options.names = options.names || {};

	const sourceBones = source.isObject3D ? source.skeleton.bones : getBones( source ),
		bones = target.isObject3D ? target.skeleton.bones : getBones( target );

	let bindBones,
		bone, name, boneTo,
		bonesPosition;

	// reset bones

	if ( target.isObject3D ) {

		target.skeleton.pose();

	} else {

		options.useTargetMatrix = true;
		options.preserveMatrix = false;

	}

	if ( options.preservePosition ) {

		bonesPosition = [];

		for ( let i = 0; i < bones.length; i ++ ) {

			bonesPosition.push( bones[ i ].position.clone() );

		}

	}

	if ( options.preserveMatrix ) {

		// reset matrix

		target.updateMatrixWorld();

		target.matrixWorld.identity();

		// reset children matrix

		for ( let i = 0; i < target.children.length; ++ i ) {

			target.children[ i ].updateMatrixWorld( true );

		}

	}

	if ( options.offsets ) {

		bindBones = [];

		for ( let i = 0; i < bones.length; ++ i ) {

			bone = bones[ i ];
			name = options.names[ bone.name ] || bone.name;

			if ( options.offsets[ name ] ) {

				bone.matrix.multiply( options.offsets[ name ] );

				bone.matrix.decompose( bone.position, bone.quaternion, bone.scale );

				bone.updateMatrixWorld();

			}

			bindBones.push( bone.matrixWorld.clone() );

		}

	}

	for ( let i = 0; i < bones.length; ++ i ) {

		bone = bones[ i ];
		name = options.names[ bone.name ] || bone.name;

		boneTo = getBoneByName( name, sourceBones );

		globalMatrix.copy( bone.matrixWorld );

		if ( boneTo ) {

			boneTo.updateMatrixWorld();

			if ( options.useTargetMatrix ) {

				relativeMatrix.copy( boneTo.matrixWorld );

			} else {

				relativeMatrix.copy( target.matrixWorld ).invert();
				relativeMatrix.multiply( boneTo.matrixWorld );

			}

			// ignore scale to extract rotation

			scale.setFromMatrixScale( relativeMatrix );
			relativeMatrix.scale( scale.set( 1 / scale.x, 1 / scale.y, 1 / scale.z ) );

			// apply to global matrix

			globalMatrix.makeRotationFromQuaternion( quat.setFromRotationMatrix( relativeMatrix ) );

			if ( target.isObject3D ) {

				const boneIndex = bones.indexOf( bone ),
					wBindMatrix = bindBones ? bindBones[ boneIndex ] : bindBoneMatrix.copy( target.skeleton.boneInverses[ boneIndex ] ).invert();

				globalMatrix.multiply( wBindMatrix );

			}

			globalMatrix.copyPosition( relativeMatrix );

		}

		if ( bone.parent && bone.parent.isBone ) {

			bone.matrix.copy( bone.parent.matrixWorld ).invert();
			bone.matrix.multiply( globalMatrix );

		} else {

			bone.matrix.copy( globalMatrix );

		}

		if ( options.preserveHipPosition && name === options.hip ) {

			bone.matrix.setPosition( pos.set( 0, bone.position.y, 0 ) );

		}

		bone.matrix.decompose( bone.position, bone.quaternion, bone.scale );

		bone.updateMatrixWorld();

	}

	if ( options.preservePosition ) {

		for ( let i = 0; i < bones.length; ++ i ) {

			bone = bones[ i ];
			name = options.names[ bone.name ] || bone.name;

			if ( name !== options.hip ) {

				bone.position.copy( bonesPosition[ i ] );

			}

		}

	}

	if ( options.preserveMatrix ) {

		// restore matrix

		target.updateMatrixWorld( true );

	}

}

function retargetClip( target, source, clip, options = {} ) {

	options.useFirstFramePosition = options.useFirstFramePosition !== undefined ? options.useFirstFramePosition : false;
	options.fps = options.fps !== undefined ? options.fps : 30;
	options.names = options.names || [];

	if ( ! source.isObject3D ) {

		source = getHelperFromSkeleton( source );

	}

	const numFrames = Math.round( clip.duration * ( options.fps / 1000 ) * 1000 ),
		delta = 1 / options.fps,
		convertedTracks = [],
		mixer = new AnimationMixer( source ),
		bones = getBones( target.skeleton ),
		boneDatas = [];
	let positionOffset,
		bone, boneTo, boneData,
		name;

	mixer.clipAction( clip ).play();
	mixer.update( 0 );

	source.updateMatrixWorld();

	for ( let i = 0; i < numFrames; ++ i ) {

		const time = i * delta;

		retarget( target, source, options );

		for ( let j = 0; j < bones.length; ++ j ) {

			name = options.names[ bones[ j ].name ] || bones[ j ].name;

			boneTo = getBoneByName( name, source.skeleton );

			if ( boneTo ) {

				bone = bones[ j ];
				boneData = boneDatas[ j ] = boneDatas[ j ] || { bone: bone };

				if ( options.hip === name ) {

					if ( ! boneData.pos ) {

						boneData.pos = {
							times: new Float32Array( numFrames + 1 ),
							values: new Float32Array( ( numFrames + 1 ) * 3 )
						};

					}

					if ( options.useFirstFramePosition ) {

						if ( i === 0 ) {

							positionOffset = bone.position.clone();

						}

						bone.position.sub( positionOffset );

					}

					boneData.pos.times[ i ] = time;

					bone.position.toArray( boneData.pos.values, i * 3 );

				}

				if ( ! boneData.quat ) {

					// `numFrames + 1` accomodate final keyframe
					boneData.quat = {
						times: new Float32Array( numFrames + 1 ),
						values: new Float32Array( ( numFrames + 1 ) * 4 )
					};

				}

				boneData.quat.times[ i ] = time;

				bone.quaternion.toArray( boneData.quat.values, i * 4 );

			}

		}

		// check for final keyframe
		if ( i === numFrames - 1 ) {

			mixer.update( Math.max( clip.duration - mixer.time, 0 ) );

		} else {

			mixer.update( delta );

		}

		source.updateMatrixWorld();

	}

	retarget( target, source, options );

	// add boneData at final keyframe
	for ( let j = 0; j < boneDatas.length; ++ j ) {

		boneData = boneDatas[ j ];

		if ( boneData ) {

			if ( boneData.pos ) {

				boneData.pos.times[ numFrames ] = clip.duration;

				bone.position.toArray( boneData.pos.values, numFrames * 3 );

			}

			if ( boneData.quat ) {

				boneData.quat.times[ numFrames ] = clip.duration;

				bone.position.toArray( boneData.quat.values, numFrames * 4 );

			}

		}

	}


	for ( let i = 0; i < boneDatas.length; ++ i ) {

		boneData = boneDatas[ i ];

		if ( boneData ) {

			if ( boneData.pos ) {

				convertedTracks.push( new VectorKeyframeTrack(
					'.bones[' + boneData.bone.name + '].position',
					boneData.pos.times,
					boneData.pos.values
				) );

			}

			convertedTracks.push( new QuaternionKeyframeTrack(
				'.bones[' + boneData.bone.name + '].quaternion',
				boneData.quat.times,
				boneData.quat.values
			) );

		}

	}

	mixer.uncacheAction( clip );

	return new AnimationClip( clip.name, - 1, convertedTracks );

}

function clone( source ) {

	const sourceLookup = new Map();
	const cloneLookup = new Map();

	const clone = source.clone();

	parallelTraverse( source, clone, function ( sourceNode, clonedNode ) {

		sourceLookup.set( clonedNode, sourceNode );
		cloneLookup.set( sourceNode, clonedNode );

	} );

	clone.traverse( function ( node ) {

		if ( ! node.isSkinnedMesh ) return;

		const clonedMesh = node;
		const sourceMesh = sourceLookup.get( node );
		const sourceBones = sourceMesh.skeleton.bones;

		clonedMesh.skeleton = sourceMesh.skeleton.clone();
		clonedMesh.bindMatrix.copy( sourceMesh.bindMatrix );

		clonedMesh.skeleton.bones = sourceBones.map( function ( bone ) {

			return cloneLookup.get( bone );

		} );

		clonedMesh.bind( clonedMesh.skeleton, clonedMesh.bindMatrix );

	} );

	return clone;

}

// internal helper

function getBoneByName( name, skeleton ) {

	for ( let i = 0, bones = getBones( skeleton ); i < bones.length; i ++ ) {

		if ( name === bones[ i ].name )

			return bones[ i ];

	}

}

function getBones( skeleton ) {

	return Array.isArray( skeleton ) ? skeleton : skeleton.bones;

}


function getHelperFromSkeleton( skeleton ) {

	const source = new SkeletonHelper( skeleton.bones[ 0 ] );
	source.skeleton = skeleton;

	return source;

}

function parallelTraverse( a, b, callback ) {

	callback( a, b );

	for ( let i = 0; i < a.children.length; i ++ ) {

		parallelTraverse( a.children[ i ], b.children[ i ], callback );

	}

}

export {
	retargetV2,
	retarget,
	retargetClip,
	clone,
};
