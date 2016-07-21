import compose, { ComposeFactory } from 'dojo-compose/compose';
import { Handle } from 'dojo-core/interfaces';
import WeakMap from 'dojo-shim/WeakMap';
import { h, VNode } from 'maquette/maquette';
import { Observable } from 'rxjs/Rx';

import columnar, { Column } from '../../structure/columnar';
import createDataProviderMixin, {
	DataProvider,
	DataProviderOptions,
	DataProviderState
} from './createDataProviderMixin';

export type ColumnStructureState<T> = DataProviderState<T>;

export interface ColumnStructureOptions<T, S extends ColumnStructureState<T>> extends DataProviderOptions<T, S> {
	/**
	 * Select the value from the input. Columns height is determined by this value.
	 *
	 * May be omitted if a `valueSelector()` implementation has been mixed in.
	 */
	valueSelector?: (input: T) => number;
}

export interface ColumnStructureMixin<T> {
	getChildrenNodes(): VNode[];

	/**
	 * Select the value from the input. Columns height is determined by this value.
	 *
	 * May be omitted if a `valueSelector()` option has been provided.
	 */
	valueSelector?: (input: T) => number;
}

/**
 * Renders columns. To be mixed into dojo-widgets/createWidget.
 */
export type ColumnStructure<T, S extends ColumnStructureState<T>> =
	DataProvider<T, S> & ColumnStructureMixin<T>;

export interface ColumnStructureFactory<T> extends ComposeFactory<
	ColumnStructure<T, ColumnStructureState<T>>,
	ColumnStructureOptions<T, ColumnStructureState<T>>
> {
	<T, S extends ColumnStructureState<T>>(options?: ColumnStructureOptions<T, S>): ColumnStructure<T, S>;
}

const structures = new WeakMap<ColumnStructure<any, ColumnStructureState<any>>, Column<any>[]>();

const createColumnStructureMixin: ColumnStructureFactory<any> = compose({
	// Assuming this is mixed in to dojo-widgets/createWidget, replace the getChildrenNodes() implementation from
	// its prototype in order to render the columns.
	getChildrenNodes(): VNode[] {
		const structure = structures.get(this);
		return structure.map((value, index) => {
			// TODO: Make width configurable
			// TODO: Read height from state
			const { input, relativeValue } = value;
			const height = relativeValue * 100;
			const y = 100 - height;
			return h('g', { key: input }, [
				h('rect', {
					width: '20',
					height: String(height),
					x: String(20 * index),
					y: String(y)
				})
			]);
		});
	}
}).mixin({
	mixin: createDataProviderMixin,
	initialize<T>(
		instance: ColumnStructure<T, ColumnStructureState<T>>,
		{ valueSelector }: ColumnStructureOptions<T, ColumnStructureState<T>> = {}
	) {
		if (!valueSelector) {
			// Allow a valueSelector implementation to be mixed in.
			valueSelector = (input: T) => {
				if (instance.valueSelector) {
					return instance.valueSelector(input);
				}

				// Default to 0, don't throw at runtime.
				return 0;
			};
		}

		// Initialize with an empty structure since the DataProvider only provides data if any is available.
		structures.set(instance, []);

		let handle: Handle = null;
		const subscribe = (data: Observable<T[]>) => {
			if (handle) {
				handle.destroy();
			}

			const subscription = columnar(data, valueSelector)
				.subscribe((structure) => {
					structures.set(instance, structure);
					// Assume this is mixed in to dojo-widgets/createWidget, in which case invalidate() is available.
					(<any> instance).invalidate();
				});

			handle = instance.own({
				destroy() {
					subscription.unsubscribe();
				}
			});
		};

		// DataProviderMixin may emit 'datachange' before this initializer can listen for it. Access it directly.
		if (instance.data) {
			subscribe(instance.data);
		}
		// Update the data if it changes.
		instance.own(instance.on('datachange', ({ data }) => subscribe(data)));
	}
});

export default createColumnStructureMixin;